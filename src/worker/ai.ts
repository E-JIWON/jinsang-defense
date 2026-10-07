import { type AiOut, parseJson, type Turn } from "../shared/game";

export type AiKind = "customer" | "reply" | "review";

const RETRYABLE = new Set([429, 503, 504]);
const DEADLINE_MS = 30_000;
const ATTEMPT_MS = 15_000;

type Failed = { ok: false; status: number };

/**
 * OpenAI 호환 /chat/completions 호출.
 * 분당 한도(429)·붐빔(503)·시간초과면 예비 모델로 넘어가고, 한 바퀴를 다 돌면 한 번 더 돈다(전체 30초).
 */
export async function ask(env: Env, kind: AiKind, prompt: string, turn?: Turn | null): Promise<AiOut> {
  const base = String(env.LLM_BASE_URL || "");
  const isLocal = /localhost|127\.0\.0\.1|trycloudflare|ngrok/.test(base);
  const isFake = env.LLM_FAKE === "1";
  if (isFake && turn?.msgs.at(-1)?.t.includes("#fail")) throw new Error("가짜 실패");
  if (isFake || (!env.LLM_API_KEY && !isLocal)) return fakeAnswer(kind, turn);

  const models = [env.LLM_MODEL, ...String(env.LLM_FALLBACK_MODELS || "").split(",")].map((m) => String(m).trim()).filter(Boolean);
  const deadline = Date.now() + DEADLINE_MS;
  let res: Response | Failed = { ok: false, status: 504 };
  let body = "";

  attempts: for (let pass = 0; pass < 2; pass++) {
    if (pass) await new Promise((r) => setTimeout(r, 1500));
    for (const model of models) {
      const left = deadline - Date.now();
      if (left < 2000) break attempts;
      res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY || "local"}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.7,
          ...(env.LLM_REASONING ? { reasoning_effort: env.LLM_REASONING } : {}),
        }),
        signal: AbortSignal.timeout(Math.min(ATTEMPT_MS, left)),
      }).catch((e: Error): Failed => ({ ok: false, status: e.name === "TimeoutError" ? 504 : 502 }));
      if (!RETRYABLE.has(res.status)) break attempts;
      body = res instanceof Response ? await res.text().catch(() => "") : "";
    }
  }

  if (!(res instanceof Response) || !res.ok) throw new Error(failureMessage(res.status, body));
  const json = await res.json<{ choices?: { message?: { content?: string } }[] }>();
  return parseJson(json.choices?.[0]?.message?.content);
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
  return { headline: "가짜 손님이 남긴 가짜 리뷰", items: [{ p: "p1", stars: 3, review: "키를 넣으면 진짜 리뷰를 써 드림." }] };
}
