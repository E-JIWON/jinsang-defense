import { DurableObject } from "cloudflare:workers";
import { fresh, remaining, TURN_MS, REACTS, customerPrompt, replyPrompt, reviewPrompt, parseJson, toCustomer, applyReply, endTurn, skipTurn, archive, toReview, fakeAnswer } from "./game.js";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/room" && req.method === "POST") {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
      return Response.json({ code });
    }
    const m = url.pathname.match(/^\/ws\/([A-Z0-9]{4,8})$/);
    if (m) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    return env.ASSETS.fetch(req);
  },
};

// AI 호출: OpenAI 호환 /chat/completions. 키가 없으면 가짜 손님으로 돌아간다(로컬 테스트용)
async function ask(env, kind, prompt, turn) {
  const local = /localhost|127\.0\.0\.1|trycloudflare|ngrok/.test(env.LLM_BASE_URL || "");
  if (!env.LLM_API_KEY && !local) return fakeAnswer(kind, turn);
  const models = [env.LLM_MODEL, env.LLM_FALLBACK_MODEL].filter(Boolean);
  let res;
  for (const model of models) {
    res = await fetch(env.LLM_BASE_URL.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY || "local"}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.9 }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.status !== 429 && res.status !== 503) break; // 혼잡·한도면 다음 모델로
  }
  if (!res.ok) throw new Error(res.status === 429 ? "오늘 무료 AI 한도를 다 썼어요." : res.status === 503 ? "AI가 지금 붐벼요. 잠시 뒤 다시 해 주세요." : `AI 오류 ${res.status}`);
  const j = await res.json();
  return parseJson(j.choices?.[0]?.message?.content);
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.g = fresh();
    ctx.blockConcurrencyWhile(async () => { this.g = (await ctx.storage.get("g")) || fresh(); });
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets() { return this.ctx.getWebSockets().filter((w) => w.readyState === 1); }
  online() { return [...new Set(this.sockets().map((w) => w.deserializeAttachment()?.id).filter(Boolean))]; }
  send(obj) { const s = JSON.stringify(obj); for (const w of this.sockets()) try { w.send(s); } catch {} }
  broadcast() { this.send({ type: "state", g: this.g, online: this.online() }); }
  async save() { await this.ctx.storage.put("g", this.g); this.broadcast(); }
  fail(ws, msg) { try { ws.send(JSON.stringify({ type: "error", msg })); } catch {} }

  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const g = this.g;
    if (m.type === "hello") {
      const id = String(m.id || "").slice(0, 40), nick = String(m.nick || "").trim().slice(0, 12);
      if (!id || !nick) return this.fail(ws, "닉네임을 입력해 주세요.");
      ws.serializeAttachment({ id });
      g.players[id] = { ...(g.players[id] || { staff: false, joinedAt: Date.now() }), nick };
      if (!g.hostId) g.hostId = id;
      return this.save();
    }
    const me = ws.deserializeAttachment()?.id;
    if (!me || !g.players[me]) return this.fail(ws, "먼저 닉네임을 정해 주세요.");
    const host = g.hostId === me, t = g.turn;
    const cur = g.order[g.turnIdx];

    switch (m.type) {
      case "join": g.players[me].staff = true; return this.save();
      case "takeHost": if (!this.online().includes(g.hostId)) { g.hostId = me; return this.save(); } return;
      case "react": {
        if (!REACTS.includes(m.e)) return;
        this.send({ type: "react", e: m.e, from: me });
        if (t?.status === "live" && t.player !== me) { t.reacts = (t.reacts || 0) + 1; await this.ctx.storage.put("g", g); }
        return;
      }
      case "newCustomer": {
        if (!host || this.busy || !(g.phase === "lobby" || g.phase === "review" || (g.phase === "playing" && !cur && t?.status !== "live"))) return;
        const order = Object.entries(g.players).filter(([, p]) => p.staff).sort((a, b) => a[1].joinedAt - b[1].joinedAt).map(([id]) => id);
        if (!order.length) return this.fail(ws, "직원으로 참가한 사람이 없어요.");
        const back = g.phase; this.busy = true; g.phase = "customer"; g.lastError = null; await this.save();
        try {
          const c = toCustomer(await ask(this.env, "customer", customerPrompt(String(m.idea || "").slice(0, 60))));
          Object.assign(g, { phase: "playing", round: g.round + 1, customer: c, order, turnIdx: 0, turn: null, roundResults: [], review: null });
          archive(g);
        } catch (e) { g.phase = back; g.lastError = "손님을 데려오지 못했어요. " + e.message; }
        this.busy = false; return this.save();
      }
      case "start": {
        if (g.phase !== "playing" || cur !== me || t?.status === "live") return;
        const now = Date.now();
        g.turn = { player: me, status: "live", anger: g.customer.anger, msgs: [{ f: "c", t: g.customer.opening }], thinking: false, clock: { spent: 0, resumeAt: now }, points: 0, reacts: 0, lastError: null };
        await this.ctx.storage.setAlarm(now + TURN_MS);
        return this.save();
      }
      case "say": {
        const text = String(m.text || "").trim().slice(0, 200);
        if (!text || t?.status !== "live" || t.player !== me || t.thinking) return;
        const now = Date.now();
        t.msgs.push({ f: "p", t: text });
        t.clock = { spent: t.clock.spent + (now - t.clock.resumeAt), resumeAt: null }; // 손님이 생각하는 동안 시계 멈춤
        t.thinking = true; t.lastError = null;
        await this.ctx.storage.deleteAlarm(); await this.save();
        let end = null;
        try { end = applyReply(t, await ask(this.env, "reply", replyPrompt(g.customer, t), t)); }
        catch (e) { t.msgs.pop(); t.thinking = false; t.clock.resumeAt = Date.now(); t.lastError = "손님이 대답을 못 했어요. 다시 보내 주세요. " + e.message; }
        if (g.turn !== t || t.status !== "live") return this.save(); // 그 사이 진행자가 끝냈으면 그대로
        if (end) endTurn(g, end); else await this.ctx.storage.setAlarm(Date.now() + remaining(t));
        return this.save();
      }
      case "endTurn": if (t?.status === "live" && (t.player === me || host)) { await this.ctx.storage.deleteAlarm(); endTurn(g, "time"); return this.save(); } return;
      case "skip": if (host && g.phase === "playing" && cur && t?.status !== "live") { skipTurn(g); return this.save(); } return;
      case "review": {
        if (!host || this.busy || g.phase !== "playing" || cur || !g.roundResults.length) return;
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
  async alarm() {
    const t = this.g.turn;
    if (t?.status !== "live" || t.thinking) return;
    const left = remaining(t);
    if (left > 500) return this.ctx.storage.setAlarm(Date.now() + left);
    endTurn(this.g, "time");
    await this.save();
  }

  async webSocketClose() { this.broadcast(); }
  async webSocketError() { this.broadcast(); }
}
