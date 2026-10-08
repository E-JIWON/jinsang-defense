import { afterEach, expect, test, vi } from "vitest";
import { ask } from "./ai";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

/** fetch를 가짜로 바꾼다. 주소마다 돌려줄 상태 코드를 정하고, 들어온 요청을 모은다. */
function fakeFetch(statusOf: (url: string) => number) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    const status = statusOf(url);
    if (status !== 200) return new Response(status === 429 ? "quota PerMinute" : "error", { status });
    const content = JSON.stringify({ grade: 12, why: "ok", reply: "흠", act: "", thought: "", anger: 40 });
    return Response.json({ choices: [{ message: { content } }] });
  });
  return calls;
}

// 주력이 429면 30초 동안 건너뛰는 기억이 주소별로 남아서, 테스트마다 주소를 다르게 쓴다.
let n = 0;
function env(extra: Partial<Env> = {}): Env {
  n++;
  return {
    LLM_BASE_URL: `https://main${n}.test/v1`,
    LLM_MODEL: "gemini-a",
    LLM_FALLBACK_MODELS: "gemini-b",
    LLM_REASONING: "low",
    LLM_API_KEY: "key",
    LLM_BACKUP_MODEL: "qwen3.5:9b",
    LLM_BACKUP_REASONING: "none",
    ...extra,
  } as unknown as Env;
}

afterEach(() => vi.unstubAllGlobals());

test("예비 주소가 없으면 예전처럼 주력만 쓴다", async () => {
  const calls = fakeFetch(() => 200);
  const out = await ask(env(), "reply", "p");
  expect(out.grade).toBe(12);
  expect(calls).toHaveLength(1);
  expect(calls[0].body.response_format).toEqual({ type: "json_object" });
  expect(calls[0].body.reasoning_effort).toBe("low");
});

test("주력 모델이 모두 한도(429)면 예비가 받고, 예비는 예시·스키마·생각 끄기를 쓴다", async () => {
  const e = env({ LLM_BACKUP_BASE_URL: "https://ollama.test/v1" });
  const calls = fakeFetch((url) => (url.includes("ollama") ? 200 : 429));
  const out = await ask(e, "reply", "p");
  expect(out.grade).toBe(12);
  // 예비가 있으면 주력은 한 바퀴만 돈다(gemini-a, gemini-b) → 예비
  expect(calls.map((c) => c.body.model)).toEqual(["gemini-a", "gemini-b", "qwen3.5:9b"]);
  const backup = calls[2].body as { messages: { role: string }[]; response_format: { type: string }; reasoning_effort: string };
  expect(backup.messages.map((m) => m.role)).toEqual(["system", "user"]);
  expect(backup.response_format.type).toBe("json_schema");
  expect(backup.reasoning_effort).toBe("none");

  // 바로 다음 호출은 막힌 주력을 건너뛰고 예비로 간다
  await ask(e, "reply", "p");
  expect(calls.map((c) => c.body.model).slice(3)).toEqual(["qwen3.5:9b"]);
});

test("주력이 한도가 아닌 오류(500)여도 예비가 받는다", async () => {
  const calls = fakeFetch((url) => (url.includes("ollama") ? 200 : 500));
  await ask(env({ LLM_BACKUP_BASE_URL: "https://ollama.test/v1" }), "reply", "p");
  expect(calls.map((c) => c.body.model)).toEqual(["gemini-a", "qwen3.5:9b"]);
});

test("예비까지 실패하면(PC 꺼짐) 안내는 주력 기준", async () => {
  fakeFetch((url) => (url.includes("ollama") ? 502 : 429));
  await expect(ask(env({ LLM_BACKUP_BASE_URL: "https://ollama.test/v1" }), "reply", "p")).rejects.toThrow("무료 분당 한도");
});

test("Access 서비스 토큰이 있으면 예비 요청에 헤더로 붙인다", async () => {
  const calls = fakeFetch((url) => (url.includes("ollama") ? 200 : 503));
  const e = env({ LLM_BACKUP_BASE_URL: "https://ollama.test/v1", LLM_BACKUP_ACCESS_ID: "id", LLM_BACKUP_ACCESS_SECRET: "secret" });
  await ask(e, "review", "p");
  const h = calls.at(-1)?.headers ?? {};
  expect(h["cf-access-client-id"]).toBe("id");
  expect(h["cf-access-client-secret"]).toBe("secret");
});

test("주력 키가 없어도 예비만으로 돌아간다", async () => {
  const calls = fakeFetch(() => 200);
  await ask(env({ LLM_API_KEY: "", LLM_BACKUP_BASE_URL: "https://ollama.test/v1" } as Partial<Env>), "customer", "p");
  expect(calls.map((c) => c.url)).toEqual(["https://ollama.test/v1/chat/completions"]);
});

test("주력이 JSON이 아닌 답을 주면 예비가 받는다", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const content = url.includes("ollama") ? '{"grade":11}' : "죄송해요, 답을 못 만들었어요";
    return Response.json({ choices: [{ message: { content } }] });
  });
  const out = await ask(env({ LLM_BACKUP_BASE_URL: "https://ollama.test/v1" }), "reply", "p");
  expect(out.grade).toBe(11);
  expect(calls).toHaveLength(2);
});
