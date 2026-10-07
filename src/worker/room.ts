import { DurableObject } from "cloudflare:workers";
import {
  applyReply,
  archive,
  countReaction,
  endTurn,
  freshGame,
  type Game,
  type Outcome,
  pruneGhosts,
  REACTS,
  remaining,
  skipTurn,
  staffOrder,
  TURN_MS,
  toCustomer,
  toReview,
} from "../shared/game";
import type { ClientMessage, ServerMessage } from "../shared/protocol";
import { ask } from "./ai";
import { publicId } from "./identity";
import { clientIp, DAY, HOUR, limiter } from "./limiter";
import { customerPrompt, replyPrompt, reviewPrompt } from "./prompts";

export const LIMITS = { ip: 120, room: 300, rooms: 30 } as const;
const MAX_PLAYERS = 30;
// 리액션 연타가 방 전체에 메시지 폭탄이 되지 않게.
const REACT_GAP_MS = 250;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

interface Attachment {
  ip: string;
  id?: string;
  lastReact?: number;
}

export class Room extends DurableObject<Env> {
  g: Game = freshGame();
  busy = false;
  sentRounds = "";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.g = (await ctx.storage.get<Game>("g")) ?? freshGame();
      // 손님 대답을 기다리다 재시작(배포 등)됐으면 멈춘 말을 '다시 보내기' 상태로 돌려놓는다.
      const t = this.g.turn;
      if (t?.status === "live" && t.thinking) {
        const last = t.msgs.at(-1);
        if (last?.f === "p") last.failed = true;
        t.thinking = false;
        t.clock.resumeAt = Date.now();
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
    server.serializeAttachment({ ip: clientIp(req) } satisfies Attachment);
    // 닉네임을 정하기 전에도 누가 있는지 보이게 바로 보낸다.
    this.sendTo(server, this.stateMsg());
    this.sendTo(server, this.roundsMsg());
    return new Response(null, { status: 101, webSocket: client });
  }

  private att(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { ip: "local" };
  }

  private sockets() {
    return this.ctx.getWebSockets().filter((w) => w.readyState === WebSocket.OPEN);
  }

  private online() {
    return [
      ...new Set(
        this.sockets()
          .map((w) => this.att(w).id)
          .filter((x): x is string => !!x),
      ),
    ];
  }

  private stateMsg(): ServerMessage {
    const { rounds: _, ...g } = this.g;
    return { type: "state", g, online: this.online() };
  }

  private roundsMsg(): ServerMessage {
    return { type: "rounds", rounds: this.g.rounds };
  }

  private sendTo(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  private sendAll(msg: ServerMessage) {
    const s = JSON.stringify(msg);
    for (const w of this.sockets()) {
      try {
        w.send(s);
      } catch {}
    }
  }

  private broadcast() {
    this.sendAll(this.stateMsg());
    const key = this.g.rounds.map((r) => `${r.round}:${r.at}`).join(",");
    if (key !== this.sentRounds) {
      this.sentRounds = key;
      this.sendAll(this.roundsMsg());
    }
  }

  private async save() {
    await this.ctx.storage.put("g", this.g);
    this.broadcast();
  }

  private fail(ws: WebSocket, msg: string) {
    this.sendTo(ws, { type: "error", msg });
  }

  /** 보낸 사람 IP · 이 방 · 전체 하루 한도를 모두 통과해야 AI를 부른다. */
  private async allowAi(ws: WebSocket): Promise<string | null> {
    const daily = Number(this.env.LLM_DAILY_LIMIT) || 1000;
    if (!(await limiter(this.env, `ip:${this.att(ws).ip}`).take(LIMITS.ip, HOUR)))
      return "AI를 너무 많이 불렀어요. 한 시간쯤 뒤 다시 해 주세요.";
    if (!(await limiter(this.env, `room:${this.ctx.id.toString()}`).take(LIMITS.room, HOUR)))
      return "이 가게가 AI를 너무 많이 불렀어요. 잠시 쉬었다 해 주세요.";
    if (!(await limiter(this.env, "global").take(daily, DAY))) return "오늘 게임 전체의 AI 한도를 다 썼어요. 내일 다시 놀아요.";
    return null;
  }

  /**
   * 한도 확인(Limiter RPC)을 기다리는 동안에도 다른 메시지가 들어오므로,
   * 기다리기 전에 busy를 세워야 연타가 AI를 두 번 부르지 않는다.
   */
  private async withAi(ws: WebSocket, run: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      const denied = await this.allowAi(ws);
      if (denied) return this.fail(ws, denied);
      await run();
    } finally {
      this.busy = false;
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let m: ClientMessage;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    if (m.type === "hello") return this.hello(ws, m.token, m.nick);

    const g = this.g;
    const me = this.att(ws).id;
    if (!me || !g.players[me]) return this.fail(ws, "먼저 닉네임을 정해 주세요.");
    const host = g.hostId === me;
    const t = g.turn;
    const cur = g.order[g.turnIdx];

    switch (m.type) {
      case "join":
      case "spectate":
        g.players[me].staff = m.type === "join";
        return this.save();
      case "takeHost":
        if (g.hostId && this.online().includes(g.hostId)) return;
        g.hostId = me;
        return this.save();
      case "react": {
        if (!(REACTS as readonly string[]).includes(String(m.e))) return;
        const a = this.att(ws);
        const now = Date.now();
        if (now - (a.lastReact ?? 0) < REACT_GAP_MS) return;
        ws.serializeAttachment({ ...a, lastReact: now } satisfies Attachment);
        this.sendAll({ type: "react", e: m.e, from: me });
        if (t?.status === "live" && countReaction(t, me)) await this.ctx.storage.put("g", g);
        return;
      }
      case "newCustomer": {
        // 손님을 부르다 재시작돼 phase만 'customer'로 남은 경우도 다시 부를 수 있게.
        const stuck = g.phase === "customer" && !this.busy;
        const roundOver = g.phase === "playing" && !cur && t?.status !== "live";
        if (!host || this.busy || !(stuck || roundOver || g.phase === "lobby" || g.phase === "review")) return;
        const order = staffOrder(g.players);
        if (!order.length) return this.fail(ws, "직원으로 참가한 사람이 없어요.");
        const back = stuck ? (g.round ? "review" : "lobby") : g.phase;
        return this.withAi(ws, async () => {
          g.phase = "customer";
          g.lastError = null;
          await this.save();
          try {
            const customer = toCustomer(await ask(this.env, "customer", customerPrompt(String(m.idea || "").slice(0, 60))));
            Object.assign(g, {
              phase: "playing",
              round: g.round + 1,
              customer,
              order,
              turnIdx: 0,
              turn: null,
              roundResults: [],
              review: null,
            });
            archive(g);
          } catch (e) {
            g.phase = back;
            g.lastError = `손님을 데려오지 못했어요. ${(e as Error).message}`;
          }
          await this.save();
        });
      }
      case "start": {
        if (g.phase !== "playing" || !g.customer || cur !== me || t?.status === "live") return;
        const now = Date.now();
        g.turn = {
          player: me,
          status: "live",
          anger: g.customer.anger,
          msgs: [{ f: "c", t: g.customer.opening }],
          thinking: false,
          clock: { spent: 0, resumeAt: now },
          points: 0,
          reacts: 0,
          lastError: null,
        };
        await this.ctx.storage.setAlarm(now + TURN_MS);
        return this.save();
      }
      case "say":
      case "retry": {
        const c = g.customer;
        if (t?.status !== "live" || t.player !== me || t.thinking || this.busy || !c) return;
        const last = t.msgs.at(-1);
        const failed = last?.failed ? last : null;
        const text =
          m.type === "retry"
            ? failed?.t
            : String(m.text || "")
                .trim()
                .slice(0, 200);
        if (!text) return;
        return this.withAi(ws, async () => {
          const now = Date.now();
          if (failed) t.msgs.pop();
          t.msgs.push({ f: "p", t: text });
          // 손님이 생각하는 동안은 플레이어 시간을 깎지 않는다.
          t.clock = { spent: t.clock.spent + (now - (t.clock.resumeAt ?? now)), resumeAt: null };
          t.thinking = true;
          t.lastError = null;
          await this.ctx.storage.deleteAlarm();
          await this.save();
          let end: Outcome | null = null;
          try {
            end = applyReply(t, await ask(this.env, "reply", replyPrompt(c, t), t));
          } catch (e) {
            const said = t.msgs.at(-1);
            if (said) said.failed = true;
            t.thinking = false;
            t.clock.resumeAt = Date.now();
            t.lastError = `손님이 대답을 못 했어요. ${(e as Error).message}`;
          }
          // 기다리는 사이 진행자가 차례를 끝냈으면 결과만 저장한다.
          if (g.turn === t && t.status === "live") {
            if (end) endTurn(g, end);
            else await this.ctx.storage.setAlarm(Date.now() + remaining(t));
          }
          await this.save();
        });
      }
      case "endTurn":
        if (t?.status !== "live" || (t.player !== me && !host)) return;
        await this.ctx.storage.deleteAlarm();
        endTurn(g, "time");
        return this.save();
      case "skip":
        if (!host || g.phase !== "playing" || !cur || t?.status === "live") return;
        skipTurn(g);
        return this.save();
      case "review": {
        const ready = g.phase === "playing" || g.phase === "reviewing";
        const c = g.customer;
        if (!host || this.busy || !ready || cur || !g.roundResults.length || !c) return;
        return this.withAi(ws, async () => {
          g.phase = "reviewing";
          await this.save();
          try {
            g.review = toReview(await ask(this.env, "review", reviewPrompt(c, g.roundResults)), g.roundResults);
          } catch {
            g.review = { headline: "손님이 리뷰를 안 남기고 떠났다.", items: [] };
          }
          g.phase = "review";
          archive(g);
          await this.save();
        });
      }
      case "close":
        if (!host) return;
        // round는 이어서 센다. 0으로 돌리면 다음 손님이 지난 기록의 같은 번호를 덮어쓴다.
        this.g = { ...freshGame(), hostId: g.hostId, players: g.players, rounds: g.rounds, round: g.round };
        await this.ctx.storage.deleteAlarm();
        return this.save();
    }
  }

  private async hello(ws: WebSocket, rawToken: unknown, rawNick: unknown) {
    const g = this.g;
    const token = String(rawToken || "");
    const nick = String(rawNick || "")
      .trim()
      .slice(0, 12);
    if (!TOKEN.test(token)) return this.fail(ws, "새로고침해 주세요.");
    if (!nick) return this.fail(ws, "닉네임을 입력해 주세요.");
    const id = await publicId(token);
    const full = () => !g.players[id] && Object.keys(g.players).length >= MAX_PLAYERS;
    if (full()) pruneGhosts(g, this.online());
    if (full()) return this.fail(ws, "가게가 꽉 찼어요.");
    ws.serializeAttachment({ ...this.att(ws), id } satisfies Attachment);
    this.sendTo(ws, { type: "you", id });
    g.players[id] = { ...(g.players[id] || { staff: true, joinedAt: Date.now() }), nick };
    if (!g.hostId) g.hostId = id;
    return this.save();
  }

  // 손님이 생각 중이면 시계가 멈춰 있으니, 대답이 끝난 뒤 남은 시간으로 다시 맞춘다.
  async alarm(): Promise<void> {
    const t = this.g.turn;
    if (t?.status !== "live" || t.thinking) return;
    const left = remaining(t);
    if (left > 500) return this.ctx.storage.setAlarm(Date.now() + left);
    endTurn(this.g, "time");
    await this.save();
  }

  async webSocketClose(): Promise<void> {
    this.broadcast();
  }

  async webSocketError(): Promise<void> {
    this.broadcast();
  }
}
