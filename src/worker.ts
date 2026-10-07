import { DurableObject } from "cloudflare:workers";
import {
  fresh, remaining, publicId, TURN_MS, REACTS, CONFIG, customerPrompt, replyPrompt, reviewPrompt, parseJson,
  toCustomer, applyReply, endTurn, skipTurn, archive, toReview, fakeAnswer,
  type Game, type Outcome, type Turn, type AiKind, type AiOut,
} from "./game.ts";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const HOUR = 3600_000, DAY = 24 * HOUR;
// 무료 AI 한도 지키기: 한 사람(IP) · 한 방 · 전체 하루
const LIMITS = { ip: 120, room: 300, rooms: 30 } as const;

const ipOf = (req: Request) => req.headers.get("CF-Connecting-IP") || "local";
const limiter = (env: Env, key: string) => env.LIMITER.get(env.LIMITER.idFromName(key));

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/room" && req.method === "POST") {
      if (!(await limiter(env, "rooms:" + ipOf(req)).take(LIMITS.rooms, HOUR))) return Response.json({ error: "가게를 너무 많이 열었어요. 잠시 뒤 다시 해 주세요." }, { status: 429 });
      const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
      return Response.json({ code });
    }
    const m = url.pathname.match(/^\/ws\/([A-Z0-9]{4,8})$/);
    if (m) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

/** 고정 창(window) 카운터. 키마다 하나 (IP, 방, 전체) */
export class Limiter extends DurableObject<Env> {
  async take(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    let w = (await this.ctx.storage.get<{ start: number; n: number }>("w")) ?? { start: now, n: 0 };
    if (now - w.start > windowMs) w = { start: now, n: 0 };
    if (w.n >= limit) return false;
    w.n++;
    await this.ctx.storage.put("w", w);
    return true;
  }
}

// AI 호출: OpenAI 호환 /chat/completions. 키가 없으면 가짜 손님으로 돌아간다(로컬 테스트용)
async function ask(env: Env, kind: AiKind, prompt: string, turn?: Turn | null): Promise<AiOut> {
  const base = String(env.LLM_BASE_URL || "");
  const local = /localhost|127\.0\.0\.1|trycloudflare|ngrok/.test(base);
  if (!env.LLM_API_KEY && !local) return fakeAnswer(kind, turn);
  // 분당 한도(429)·구글 서버 붐빔(503)·시간초과면 다음 모델로, 한 바퀴 돌면 1.5초 쉬고 한 바퀴 더. 전체 30초까지
  const models = [env.LLM_MODEL, ...String(env.LLM_FALLBACK_MODELS || "").split(",")].map((m) => String(m).trim()).filter(Boolean);
  const deadline = Date.now() + 30000;
  let res: Response | { ok: false; status: number } = { ok: false, status: 504 }, body = "";
  tries: for (let pass = 0; pass < 2; pass++) {
    if (pass) await new Promise((r) => setTimeout(r, 1500));
    for (const model of models) {
      const left = deadline - Date.now();
      if (left < 2000) break tries;
      res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY || "local"}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.7, ...(env.LLM_REASONING ? { reasoning_effort: env.LLM_REASONING } : {}) }),
        signal: AbortSignal.timeout(Math.min(15000, left)),
      }).catch((e: Error) => ({ ok: false as const, status: e.name === "TimeoutError" ? 504 : 502 }));
      if (![429, 503, 504].includes(res.status)) break tries;
      body = res instanceof Response ? await res.text().catch(() => "") : "";
    }
  }
  if (!(res instanceof Response) || !res.ok) throw new Error(res.status === 429
    ? (/PerDay/i.test(body) ? "오늘 무료 AI 한도를 다 썼어요. 내일 다시 놀아요." : "AI가 잠깐 숨 고르는 중이에요(무료 분당 한도). 10초쯤 뒤 다시 보내 주세요.")
    : res.status === 503 || res.status === 504 ? "구글 AI 서버가 잠깐 붐벼요(게임 문제는 아니에요). 다시 보내기를 눌러 주세요." : `AI 오류 ${res.status}`);
  const j = await res.json<{ choices?: { message?: { content?: string } }[] }>();
  return parseJson(j.choices?.[0]?.message?.content);
}

/** 소켓에 붙여 두는 정보. id는 hello 뒤에 생긴다 */
interface Att { ip: string; id?: string }
type Incoming = { type: string; [k: string]: unknown };

export class Room extends DurableObject<Env> {
  g: Game = fresh();
  busy = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.g = (await ctx.storage.get<Game>("g")) ?? fresh();
      // 손님 대답을 기다리다 서버가 재시작됐으면(배포 등) 멈춘 말을 '다시 보내기' 상태로 돌려놓는다
      const t = this.g.turn;
      if (t?.status === "live" && t.thinking) {
        const last = t.msgs.at(-1);
        if (last?.f === "p") last.failed = true;
        t.thinking = false; t.clock.resumeAt = Date.now();
        t.lastError = "서버가 잠깐 다시 켜졌어요. 다시 보내기를 눌러 주세요.";
        await ctx.storage.put("g", this.g);
        await ctx.storage.setAlarm(Date.now() + remaining(t));
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ip: ipOf(req) } satisfies Att);
    server.send(JSON.stringify(this.stateMsg())); // 닉네임 정하기 전에도 누가 있는지 보이게
    return new Response(null, { status: 101, webSocket: client });
  }

  att(ws: WebSocket): Att { return (ws.deserializeAttachment() as Att | null) ?? { ip: "local" }; }
  sockets() { return this.ctx.getWebSockets().filter((w) => w.readyState === WebSocket.OPEN); }
  online() { return [...new Set(this.sockets().map((w) => this.att(w).id).filter((x): x is string => !!x))]; }
  stateMsg() { return { type: "state", g: this.g, online: this.online(), config: CONFIG }; }
  send(obj: unknown) { const s = JSON.stringify(obj); for (const w of this.sockets()) try { w.send(s); } catch {} }
  broadcast() { this.send(this.stateMsg()); }
  async save() { await this.ctx.storage.put("g", this.g); this.broadcast(); }
  fail(ws: WebSocket, msg: string) { try { ws.send(JSON.stringify({ type: "error", msg })); } catch {} }

  /** AI를 부르기 전에: 보낸 사람 IP · 이 방 · 전체 하루 한도를 모두 통과해야 한다 */
  async allowAi(ws: WebSocket): Promise<string | null> {
    const daily = Number(this.env.LLM_DAILY_LIMIT) || 1000;
    if (!(await limiter(this.env, "ip:" + this.att(ws).ip).take(LIMITS.ip, HOUR))) return "AI를 너무 많이 불렀어요. 한 시간쯤 뒤 다시 해 주세요.";
    if (!(await limiter(this.env, "room:" + this.ctx.id.toString()).take(LIMITS.room, HOUR))) return "이 가게가 AI를 너무 많이 불렀어요. 잠시 쉬었다 해 주세요.";
    if (!(await limiter(this.env, "global").take(daily, DAY))) return "오늘 게임 전체의 AI 한도를 다 썼어요. 내일 다시 놀아요.";
    return null;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let m: Incoming; try { m = JSON.parse(String(raw)); } catch { return; }
    const g = this.g;
    if (m.type === "hello") {
      // 토큰은 브라우저만 안다. 공개 id는 토큰의 해시라서 남의 id를 알아도 흉내 낼 수 없다
      const token = String(m.token || ""), nick = String(m.nick || "").trim().slice(0, 12);
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return this.fail(ws, "새로고침해 주세요.");
      if (!nick) return this.fail(ws, "닉네임을 입력해 주세요.");
      const id = await publicId(token);
      ws.serializeAttachment({ ...this.att(ws), id } satisfies Att);
      ws.send(JSON.stringify({ type: "you", id }));
      g.players[id] = { ...(g.players[id] || { staff: true, joinedAt: Date.now() }), nick }; // 들어오면 기본은 직원
      if (!g.hostId) g.hostId = id;
      return this.save();
    }
    const me = this.att(ws).id;
    if (!me || !g.players[me]) return this.fail(ws, "먼저 닉네임을 정해 주세요.");
    const host = g.hostId === me, t = g.turn;
    const cur = g.order[g.turnIdx];

    switch (m.type) {
      case "join": g.players[me].staff = true; return this.save();
      case "spectate": g.players[me].staff = false; return this.save();
      case "takeHost": if (!g.hostId || !this.online().includes(g.hostId)) { g.hostId = me; return this.save(); } return;
      case "react": {
        if (!(REACTS as readonly string[]).includes(String(m.e))) return;
        this.send({ type: "react", e: m.e, from: me });
        if (t?.status === "live" && t.player !== me) { t.reacts = (t.reacts || 0) + 1; await this.ctx.storage.put("g", g); }
        return;
      }
      case "newCustomer": {
        const stuck = g.phase === "customer" && !this.busy; // 손님 부르다 서버가 재시작된 경우
        if (!host || this.busy || !(stuck || g.phase === "lobby" || g.phase === "review" || (g.phase === "playing" && !cur && t?.status !== "live"))) return;
        const order = Object.entries(g.players).filter(([, p]) => p.staff).sort((a, b) => a[1].joinedAt - b[1].joinedAt).map(([id]) => id);
        if (!order.length) return this.fail(ws, "직원으로 참가한 사람이 없어요.");
        const denied = await this.allowAi(ws);
        if (denied) return this.fail(ws, denied);
        const back = stuck ? (g.round ? "review" : "lobby") : g.phase;
        this.busy = true; g.phase = "customer"; g.lastError = null; await this.save();
        try {
          const c = toCustomer(await ask(this.env, "customer", customerPrompt(String(m.idea || "").slice(0, 60))));
          Object.assign(g, { phase: "playing", round: g.round + 1, customer: c, order, turnIdx: 0, turn: null, roundResults: [], review: null });
          archive(g);
        } catch (e) { g.phase = back; g.lastError = "손님을 데려오지 못했어요. " + (e as Error).message; }
        this.busy = false; return this.save();
      }
      case "start": {
        if (g.phase !== "playing" || !g.customer || cur !== me || t?.status === "live") return;
        const now = Date.now();
        g.turn = { player: me, status: "live", anger: g.customer.anger, msgs: [{ f: "c", t: g.customer.opening }], thinking: false, clock: { spent: 0, resumeAt: now }, points: 0, reacts: 0, lastError: null };
        await this.ctx.storage.setAlarm(now + TURN_MS);
        return this.save();
      }
      case "say":
      case "retry": {
        if (t?.status !== "live" || t.player !== me || t.thinking || !g.customer) return;
        const last = t.msgs.at(-1);
        const failed = last?.failed ? last : null;
        const text = m.type === "retry" ? failed?.t : String(m.text || "").trim().slice(0, 200);
        if (!text) return;
        const denied = await this.allowAi(ws);
        if (denied) return this.fail(ws, denied);
        const now = Date.now();
        if (failed) t.msgs.pop(); // 실패한 말은 새 말(또는 같은 말 재전송)로 바꿔 끼운다
        t.msgs.push({ f: "p", t: text });
        t.clock = { spent: t.clock.spent + (now - (t.clock.resumeAt ?? now)), resumeAt: null }; // 손님이 생각하는 동안 시계 멈춤
        t.thinking = true; t.lastError = null;
        await this.ctx.storage.deleteAlarm(); await this.save();
        let end: Outcome | null = null;
        try { end = applyReply(t, await ask(this.env, "reply", replyPrompt(g.customer, t), t)); }
        catch (e) { t.msgs.at(-1)!.failed = true; t.thinking = false; t.clock.resumeAt = Date.now(); t.lastError = "손님이 대답을 못 했어요. " + (e as Error).message; }
        if (g.turn !== t || t.status !== "live") return this.save(); // 그 사이 진행자가 끝냈으면 그대로
        if (end) endTurn(g, end); else await this.ctx.storage.setAlarm(Date.now() + remaining(t));
        return this.save();
      }
      case "endTurn": if (t?.status === "live" && (t.player === me || host)) { await this.ctx.storage.deleteAlarm(); endTurn(g, "time"); return this.save(); } return;
      case "skip": if (host && g.phase === "playing" && cur && t?.status !== "live") { skipTurn(g); return this.save(); } return;
      case "review": {
        if (!host || this.busy || !(g.phase === "playing" || g.phase === "reviewing") || cur || !g.roundResults.length || !g.customer) return;
        const denied = await this.allowAi(ws);
        if (denied) return this.fail(ws, denied);
        this.busy = true; g.phase = "reviewing"; await this.save();
        try { g.review = toReview(await ask(this.env, "review", reviewPrompt(g.customer, g.roundResults)), g.roundResults); }
        catch { g.review = { headline: "손님이 리뷰를 안 남기고 떠났다.", items: [] }; }
        g.phase = "review"; archive(g); this.busy = false;
        return this.save();
      }
      case "close": if (host) { this.g = { ...fresh(), hostId: g.hostId, players: g.players, rounds: g.rounds }; await this.ctx.storage.deleteAlarm(); return this.save(); } return;
    }
  }

  // 시간 종료: 손님이 생각 중이면 대답 끝난 뒤 다시 맞춰 둔다
  async alarm(): Promise<void> {
    const t = this.g.turn;
    if (t?.status !== "live" || t.thinking) return;
    const left = remaining(t);
    if (left > 500) return this.ctx.storage.setAlarm(Date.now() + left);
    endTurn(this.g, "time");
    await this.save();
  }

  async webSocketClose(): Promise<void> { this.broadcast(); }
  async webSocketError(): Promise<void> { this.broadcast(); }
}
