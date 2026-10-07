export const TURN_MS = 120_000;
export const MAX_LINES = 10;
export const MAX_ROUNDS = 30;
export const REACTS = ["🔥", "😂", "💀", "👏"] as const;
export const OUTCOME = {
  happy: "만족 퇴장",
  boom: "손님 폭발",
  time: "시간 종료",
  lines: "대화 한도",
  skip: "자리 비움",
} as const;

export type Reaction = (typeof REACTS)[number];
export type Outcome = keyof typeof OUTCOME;
export type Phase = "lobby" | "customer" | "playing" | "reviewing" | "review";

export interface Msg {
  f: "c" | "p";
  t: string;
  act?: string;
  thought?: string;
  g?: number;
  why?: string;
  failed?: boolean;
}

export interface Customer {
  name: string;
  place: string;
  staff: string;
  goal: string;
  want: string;
  tags: string[];
  situation: string;
  opening: string;
  anger: number;
}

export interface Clock {
  spent: number;
  resumeAt: number | null;
}

export interface Turn {
  player: string;
  status: "live" | "done";
  anger: number;
  msgs: Msg[];
  thinking: boolean;
  clock: Clock;
  points: number;
  reacts: number;
  lastError: string | null;
  endedBy?: Outcome;
  bonus?: number;
  score?: number;
}

export interface Result {
  player: string;
  anger: number;
  endedBy: Outcome;
  score: number;
  msgs: Msg[];
}

export interface Review {
  headline: string;
  items: { player: string; stars: number; review: string }[];
}

export interface Round {
  round: number;
  customer: Customer | null;
  results: Result[];
  review: Review | null;
  at: number;
}

export interface Player {
  nick: string;
  staff: boolean;
  joinedAt: number;
}

export interface Game {
  hostId: string | null;
  players: Record<string, Player>;
  phase: Phase;
  round: number;
  order: string[];
  turnIdx: number;
  customer: Customer | null;
  turn: Turn | null;
  roundResults: Result[];
  review: Review | null;
  scores: Record<string, number>;
  rounds: Round[];
  lastError: string | null;
}

/** AI가 돌려준 JSON. 모양을 믿지 않고 필드마다 검사해서 꺼낸다. */
export type AiOut = Record<string, unknown>;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const str = (v: unknown, max = 400) => String(v ?? "").slice(0, max);
const int = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback);

export function freshGame(): Game {
  return {
    hostId: null,
    players: {},
    phase: "lobby",
    round: 0,
    order: [],
    turnIdx: 0,
    customer: null,
    turn: null,
    roundResults: [],
    review: null,
    scores: {},
    rounds: [],
    lastError: null,
  };
}

export const staffOf = (c: Customer | null) => c?.staff || `${c?.place || "가게"} 직원`;
export const goalOf = (c: Customer | null) => c?.goal || "손님 분노를 낮춰서 웃으며 돌려보내기";

/** 직원으로 참가한 사람을 들어온 순서대로. 이 순서가 응대 차례가 된다. */
export const staffOrder = (players: Record<string, Player>) =>
  Object.entries(players)
    .filter(([, p]) => p.staff)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([id]) => id);

export function remaining(t: Turn | null, now = Date.now()): number {
  if (!t) return TURN_MS;
  return TURN_MS - t.clock.spent - (t.clock.resumeAt ? now - t.clock.resumeAt : 0);
}

/** 코드펜스나 앞뒤 잡담이 섞여도 첫 `{`부터 마지막 `}`까지를 JSON으로 읽는다. */
export function parseJson(text: unknown): AiOut {
  const s = String(text || "").replace(/```(?:json)?/g, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI 응답이 JSON이 아니에요");
  return JSON.parse(s.slice(a, b + 1)) as AiOut;
}

export function toCustomer(out: AiOut): Customer {
  return {
    name: str(out.name, 40) || "이름 모를 손님",
    place: str(out.place, 40),
    staff: str(out.staff, 40),
    goal: str(out.goal, 80),
    want: str(out.want, 80),
    tags: (Array.isArray(out.tags) ? out.tags : []).slice(0, 4).map((x) => str(x, 20)),
    situation: str(out.situation, 300),
    opening: str(out.opening, 300) || "저기요!",
    anger: clamp(int(out.anger, 50), 20, 80),
  };
}

/** 손님 대답을 차례에 반영하고, 차례가 끝날 조건이면 그 이유를 돌려준다. */
export function applyReply(t: Turn, out: AiOut, now = Date.now()): Outcome | null {
  const grade = clamp(int(out.grade, 0), 0, 20);
  const said = t.msgs.at(-1);
  if (said) {
    said.g = grade;
    said.why = str(out.why, 12);
    delete said.failed;
  }
  t.points += grade;
  t.anger = clamp(int(out.anger, t.anger), 0, 100);
  t.msgs.push({ f: "c", t: str(out.reply) || "…", act: str(out.act, 120), thought: str(out.thought, 120) });
  t.thinking = false;
  t.lastError = null;
  t.clock.resumeAt = now;

  const lines = t.msgs.filter((m) => m.f === "p").length;
  if (t.anger >= 100) return "boom";
  if (t.anger <= 5) return "happy";
  if (lines >= MAX_LINES) return "lines";
  if (remaining(t, now) <= 0) return "time";
  return null;
}

/** 점수 = 한마디마다 받은 응대 점수 합 + 만족 퇴장 30 + 리액션(최대 20). 폭발하면 보너스 없음. */
export function endTurn(g: Game, reason: Outcome, now = Date.now()): void {
  const t = g.turn;
  if (!t) return;
  if (t.clock.resumeAt) t.clock = { spent: t.clock.spent + (now - t.clock.resumeAt), resumeAt: null };
  t.status = "done";
  t.endedBy = reason;
  t.thinking = false;
  t.bonus = (reason === "happy" ? 30 : 0) + (reason === "boom" ? 0 : Math.min(20, t.reacts * 2));
  t.score = t.points + t.bonus;
  g.scores[t.player] = (g.scores[t.player] || 0) + t.score;
  g.roundResults.push({ player: t.player, anger: t.anger, endedBy: reason, score: t.score, msgs: t.msgs });
  g.turnIdx += 1;
  archive(g);
}

export function skipTurn(g: Game): void {
  g.roundResults.push({ player: g.order[g.turnIdx], anger: g.customer?.anger ?? 50, endedBy: "skip", score: 0, msgs: [] });
  g.turnIdx += 1;
  archive(g);
}

/** 지난 손님 기록은 응대가 끝날 때마다 덮어써서, 리뷰 전에 가게를 정리해도 남게 한다. */
export function archive(g: Game, now = Date.now()): void {
  const entry: Round = { round: g.round, customer: g.customer, results: g.roundResults, review: g.review, at: now };
  const i = g.rounds.findIndex((r) => r.round === g.round);
  if (i >= 0) g.rounds[i] = entry;
  else g.rounds.push(entry);
  // 방 상태를 저장 한 칸에 담기 때문에 오래된 손님부터 버린다.
  if (g.rounds.length > MAX_ROUNDS) g.rounds.splice(0, g.rounds.length - MAX_ROUNDS);
}

export function toReview(out: AiOut, rs: Result[]): Review {
  const items = (Array.isArray(out.items) ? out.items : []) as AiOut[];
  return {
    headline: str(out.headline, 120),
    items: rs.map((r, i) => {
      const it = items.find((x) => x?.p === `p${i + 1}`) ?? {};
      return { player: r.player, stars: clamp(int(it.stars, 1), 1, 5), review: str(it.review, 300) || "…" };
    }),
  };
}
