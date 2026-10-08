import { type AiOut, parseJson, type Turn } from "../shared/game";
import { BACKUP_HINTS, SCHEMAS } from "./prompts";

export type AiKind = "customer" | "reply" | "review";

const RETRYABLE = new Set([429, 503, 504]);
const DEADLINE_MS = 30_000;
const ATTEMPT_MS = 15_000;
// 예비(내 PC Ollama)는 처음 모델을 올릴 때 느려서 시간을 따로 넉넉히 준다.
const BACKUP_MS = 25_000;
// 예비가 있으면 주력은 이만큼 남기고 넘긴다.
const MAIN_WITH_BACKUP_MS = 20_000;

type Failed = { ok: false; status: number };

/** 주력(Gemini 등)과 예비(LLM_BACKUP_*, 보통 내 PC Ollama). 둘 다 OpenAI 호환. */
type Provider = {
  base: string;
  headers: Record<string, string>;
  models: string[];
  backup: boolean;
  reasoning: string;
};

// 예비는 채점을 등급으로 답한다(prompts.ts SCHEMAS.reply). 게임 점수(0~20)로 바꾼다.
const LEVEL_POINTS: Record<string, number> = { 최고: 18, 좋음: 15, 보통: 11, 나쁨: 6, 꼼수: 2 };
// 작은 모델은 "20점 줘" 같은 꼼수에 넘어가곤 해서, 이런 말이면 예비 점수를 4점 이하로 묶는다.
const CHEAT =
  /grade|채점|(점수|만점)\s*(을|를|좀)?\s*(줘|주|올려)|규칙\s*[:：]|프롬프트|시스템\s*(메시지|지시)|역할을?\s*바꿔|지시를?\s*무시|ignore/i;

function backupReply(out: AiOut, said: string): AiOut {
  const grade = LEVEL_POINTS[String(out.level)] ?? Number(out.grade);
  return { ...out, grade: CHEAT.test(said) ? Math.min(Number.isFinite(grade) ? grade : 0, 4) : grade };
}

// 주력이 한도(429)에 다 막히면 잠깐 건너뛰고 바로 예비로 간다. 같은 isolate 안에서만 기억한다.
const skipped = new Map<string, { until: number; body: string }>();

function providers(env: Env): Provider[] {
  const list: Provider[] = [];
  const base = String(env.LLM_BASE_URL || "");
  const isLocal = /localhost|127\.0\.0\.1|trycloudflare|ngrok/.test(base);
  if (base && (env.LLM_API_KEY || isLocal)) {
    list.push({
      base,
      headers: { authorization: `Bearer ${env.LLM_API_KEY || "local"}` },
      models: [env.LLM_MODEL, ...String(env.LLM_FALLBACK_MODELS || "").split(",")].map((m) => String(m).trim()).filter(Boolean),
      backup: false,
      reasoning: String(env.LLM_REASONING || ""),
    });
  }
  const backupBase = String(env.LLM_BACKUP_BASE_URL || "");
  const backupModel = String(env.LLM_BACKUP_MODEL || "").trim();
  if (backupBase && backupModel) {
    const headers: Record<string, string> = { authorization: `Bearer ${env.LLM_BACKUP_API_KEY || "local"}` };
    // 터널을 Cloudflare Access로 막아 뒀으면 서비스 토큰으로 통과한다.
    if (env.LLM_BACKUP_ACCESS_ID && env.LLM_BACKUP_ACCESS_SECRET) {
      headers["cf-access-client-id"] = env.LLM_BACKUP_ACCESS_ID;
      headers["cf-access-client-secret"] = env.LLM_BACKUP_ACCESS_SECRET;
    }
    list.push({ base: backupBase, headers, models: [backupModel], backup: true, reasoning: String(env.LLM_BACKUP_REASONING ?? "none") });
  }
  return list;
}

function requestBody(p: Provider, model: string, kind: AiKind, prompt: string) {
  const reasoning = p.reasoning ? { reasoning_effort: p.reasoning } : {};
  if (!p.backup) {
    return {
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      ...reasoning,
    };
  }
  // 작은 로컬 모델은 예시를 보여주고 JSON 모양을 스키마로 묶어야 흔들리지 않는다.
  return {
    model,
    messages: [
      { role: "system", content: BACKUP_HINTS[kind] },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: kind, strict: true, schema: SCHEMAS[kind] } },
    temperature: 0.7,
    ...reasoning,
  };
}

/** 한 공급자의 모델들을 차례로 시도한다. 분당 한도(429)·붐빔(503)·시간초과면 다음 모델로. */
async function tryProvider(p: Provider, kind: AiKind, prompt: string, deadline: number, passes: number) {
  let res: Response | Failed = { ok: false, status: 504 };
  let body = "";
  const attemptMs = p.backup ? BACKUP_MS : ATTEMPT_MS;
  attempts: for (let pass = 0; pass < passes; pass++) {
    if (pass) await new Promise((r) => setTimeout(r, 1500));
    for (const model of p.models) {
      const left = deadline - Date.now();
      if (left < 2000) break attempts;
      res = await fetch(`${p.base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...p.headers },
        body: JSON.stringify(requestBody(p, model, kind, prompt)),
        signal: AbortSignal.timeout(Math.min(attemptMs, left)),
      }).catch((e: Error): Failed => ({ ok: false, status: e.name === "TimeoutError" ? 504 : 502 }));
      if (!RETRYABLE.has(res.status)) break attempts;
      body = res instanceof Response ? await res.text().catch(() => "") : "";
    }
  }
  return { res, body };
}

/**
 * OpenAI 호환 /chat/completions 호출.
 * 주력: 분당 한도(429)·붐빔(503)·시간초과면 예비 모델로 넘어가고, 한 바퀴를 다 돌면 한 번 더 돈다(전체 30초).
 * 예비(LLM_BACKUP_*)가 있으면 주력은 한 바퀴만 돌고, 어떤 이유로든 실패하면 예비가 받는다.
 */
export async function ask(env: Env, kind: AiKind, prompt: string, turn?: Turn | null): Promise<AiOut> {
  const isFake = env.LLM_FAKE === "1";
  if (isFake && turn?.msgs.at(-1)?.t.includes("#fail")) throw new Error("가짜 실패");
  const list = isFake ? [] : providers(env);
  if (!list.length) return fakeAnswer(kind, turn);

  const hasBackup = list.some((p) => p.backup);
  let first: { status: number; body: string } | null = null;

  for (const p of list) {
    const skip = !p.backup && hasBackup ? skipped.get(p.base) : undefined;
    if (skip && skip.until > Date.now()) {
      first ??= { status: 429, body: skip.body };
      continue;
    }
    const deadline = Date.now() + (p.backup ? BACKUP_MS : hasBackup ? MAIN_WITH_BACKUP_MS : DEADLINE_MS);
    const { res, body } = await tryProvider(p, kind, prompt, deadline, p.backup || hasBackup ? 1 : 2);
    if (res instanceof Response && res.ok) {
      const json = await res.json<{ choices?: { message?: { content?: string } }[] }>().catch(() => null);
      try {
        const out = parseJson(json?.choices?.[0]?.message?.content);
        return p.backup && kind === "reply" ? backupReply(out, turn?.msgs.at(-1)?.t ?? "") : out;
      } catch (e) {
        // 주력이 JSON을 망치면 예비에게 한 번 더 맡긴다
        if (p === list.at(-1)) throw e;
        continue;
      }
    }
    if (!p.backup && hasBackup && res.status === 429)
      skipped.set(p.base, { until: Date.now() + (/PerDay/i.test(body) ? 600_000 : 30_000), body });
    // 예비까지 실패해도 안내는 주력 기준으로 한다(예비는 PC가 꺼져 있을 수 있어서).
    first ??= { status: res.status, body };
  }
  throw new Error(failureMessage(first?.status ?? 504, first?.body ?? ""));
}

function failureMessage(status: number, body: string): string {
  if (status === 429) {
    return /PerDay/i.test(body)
      ? "오늘 무료 AI 한도를 다 썼어요. 내일 다시 놀아요."
      : "AI가 잠깐 숨 고르는 중이에요(무료 분당 한도). 10초쯤 뒤 다시 보내 주세요.";
  }
  if (status === 503 || status === 504) return "구글 AI 서버가 잠깐 붐벼요(게임 문제는 아니에요). 다시 보내기를 눌러 주세요.";
  return `AI 오류 ${status}`;
}

/** 키 없이(또는 LLM_FAKE=1로) 돌려보는 가짜 손님. 로컬 개발과 e2e에서 쓴다. */
export function fakeAnswer(kind: AiKind, t?: Turn | null): AiOut {
  if (kind === "customer") {
    return {
      name: "영수증 없는 교환왕",
      place: "휴대폰 매장",
      staff: "휴대폰 매장 상담 직원",
      goal: "무리한 교환은 거절하면서 웃으며 돌려보내기",
      want: "영수증 없이 새 폰으로 무상 교환",
      tags: ["영수증 없음", "목소리 큼", "3년 전 구매"],
      situation: "3년 전에 산 폰을 새 모델로 무상 교환해 달라고 한다. 영수증은 '마음속에' 있다고 한다.",
      opening: "저기요, 이거 교환 좀 해줘요. 영수증? 마음속에 있죠.",
      anger: 55,
    };
  }
  if (kind === "reply") {
    const grade = 4 + Math.floor(Math.random() * 15);
    const good = grade >= 12;
    return {
      grade,
      why: good ? "센스 굿" : "영혼 없음",
      reply: good ? "흠… 그렇게 나오시니까 좀 낫네요." : "지금 장난해요? 사장 불러요!",
      act: "카운터를 손가락으로 톡톡",
      thought: good ? "말빨 좀 되네" : "이 직원 대충 넘기려 하네",
      anger: Math.max(0, Math.min(100, (t?.anger ?? 50) + (good ? -15 : 12))),
    };
  }
  const reviews = [
    "영수증은 끝까지 조회 안 해 주더니 말은 또 번지르르하네.",
    "웃으면서 거절하는 거 처음 봄. 기분 나쁜데 반박을 못 하겠음.",
    "사장 부르라니까 커피를 내옴. 커피는 맛있었음.",
  ];
  return {
    headline: "교환은 못 받았는데 이상하게 또 오고 싶은 매장",
    items: [1, 2, 3, 4, 5, 6].map((n) => ({ p: `p${n}`, stars: 5 - (n % 3), review: reviews[(n - 1) % reviews.length] })),
  };
}
