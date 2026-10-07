// 기능 QA: 떠 있는 서버에 여러 명이 웹소켓으로 붙어 한 판 전체를 확인한다.
//   npx wrangler dev --port 8789 --var LLM_FAKE:1     (가짜 AI. 무료 한도 안 씀)
//   BASE=http://localhost:8789 npm run e2e
//   E2E_SLOW=1 이면 2분 시간 종료(서버 알람)까지 기다려서 확인한다
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, Round } from "../src/game.ts";

const BASE = process.env.BASE || "http://localhost:8789";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(f: () => unknown, what: string, ms = 15000) {
  const t = Date.now();
  while (!f()) { if (Date.now() - t > ms) throw new Error("기다리다 시간 초과: " + what); await wait(50); }
}

class Player {
  ws: WebSocket; g: Game | null = null; me: string | null = null; rounds: Round[] = []; errors: string[] = []; reacts: string[] = [];
  ready: Promise<void>;
  token: string; nick: string;
  constructor(code: string, token: string, nick: string) {
    this.token = token; this.nick = nick;
    this.ws = new WebSocket(`${BASE.replace("http", "ws")}/ws/${code}`);
    this.ws.addEventListener("message", (e: MessageEvent) => {
      const m = JSON.parse(String(e.data));
      if (m.type === "state") this.g = m.g;
      if (m.type === "you") this.me = m.id;
      if (m.type === "rounds") this.rounds = m.rounds;
      if (m.type === "error") this.errors.push(m.msg);
      if (m.type === "react") this.reacts.push(m.e);
    });
    this.ready = new Promise((r) => { this.ws.addEventListener("open", () => r()); });
  }
  send(type: string, x: Record<string, unknown> = {}) { this.ws.send(JSON.stringify({ type, ...x })); }
  async hello() { await this.ready; this.send("hello", { token: this.token, nick: this.nick }); await until(() => this.me, this.nick + " 입장"); }
  get game() { return this.g!; }
  close() { this.ws.close(); }
}

const newRoom = async () => ((await (await fetch(BASE + "/api/room", { method: "POST" })).json()) as { code: string }).code;
const tok = (s: string) => (s + "-token-0123456789abcdef").slice(0, 32);

test("한 판 전체: 입장 → 손님 → 응대 → 리액션 → 실패/재시도 → 건너뛰기 → 리뷰 → 정리", async (t) => {
  const code = await newRoom();
  const host = new Player(code, tok("host"), "봉칠");
  const friend = new Player(code, tok("friend"), "성찬");
  const viewer = new Player(code, tok("viewer"), "지영");

  await t.test("입장: 공개 id 받고, 기본은 직원, 첫 사람이 진행자", async () => {
    await host.hello(); await friend.hello(); await viewer.hello();
    await until(() => Object.keys(host.game.players).length === 3, "3명");
    assert.equal(host.game.hostId, host.me);
    assert.ok(host.game.players[friend.me!].staff);
    assert.equal(host.game.players[host.me!].nick, "봉칠");
    assert.equal("rounds" in host.game, false, "상태에는 rounds를 싣지 않는다");
  });

  await t.test("구경 전환", async () => {
    viewer.send("spectate");
    await until(() => host.game.players[viewer.me!].staff === false, "구경 전환");
  });

  await t.test("사칭: 진행자 공개 id를 토큰으로 써도 다른 사람이 된다", async () => {
    const evil = new Player(code, host.me! + "zzzzzzzzzz", "가짜");
    await evil.hello();
    assert.notEqual(evil.me, host.me);
    evil.send("close");
    await wait(200);
    assert.equal(host.game.hostId, host.me);
    evil.send("spectate"); evil.close();
  });

  await t.test("진행자가 아니면 손님을 못 부른다", async () => {
    friend.send("newCustomer", {});
    await wait(300);
    assert.equal(host.game.phase, "lobby");
  });

  await t.test("손님 입장: 직원만 근무표에", async () => {
    host.send("newCustomer", { idea: "우리 회사 탕비실" });
    await until(() => host.game.phase === "playing", "손님 입장");
    assert.deepEqual(host.game.order, [host.me, friend.me]);
    assert.ok(host.game.customer?.name);
    assert.equal(host.rounds.length, 1, "지난 손님 기록은 rounds 메시지로 따로 온다");
  });

  await t.test("내 차례가 아니면 시작 못 한다", async () => {
    friend.send("start");
    await wait(300);
    assert.equal(host.game.turn, null);
  });

  await t.test("응대: 대답·점수·리액션 보너스", async () => {
    host.send("start");
    await until(() => host.game.turn?.status === "live", "응대 시작");
    host.send("say", { text: "규정상 어렵지만 대안을 드릴게요" });
    await until(() => host.game.turn!.msgs.length === 3, "손님 대답");
    assert.equal(typeof host.game.turn!.msgs[1].g, "number");
    friend.send("react", { e: "😂" }); friend.send("react", { e: "😂" }); // 두 번째는 연타 제한에 걸린다
    await wait(300); friend.send("react", { e: "🔥" });
    await until(() => host.reacts.length >= 2, "리액션 전달");
    assert.equal(host.reacts.length, 2, "250ms 안 연타는 무시");
  });

  await t.test("AI 실패 → 내 말은 남고 '다시 보내기' → 성공", async () => {
    host.send("say", { text: "이건 실패할 말 #fail" });
    await until(() => host.game.turn!.lastError, "실패 표시");
    const last = host.game.turn!.msgs.at(-1)!;
    assert.equal(last.failed, true);
    assert.equal(host.game.turn!.thinking, false);
    host.send("say", { text: "다시 정중하게 말씀드릴게요" }); // 실패한 말은 새 말로 바뀐다
    await until(() => host.game.turn!.msgs.at(-1)!.f === "c" && !host.game.turn!.lastError, "재전송 대답");
    assert.equal(host.game.turn!.msgs.filter((m) => m.failed).length, 0);
  });

  await t.test("그만하기 → 점수 누적, 다음 차례", async () => {
    host.send("endTurn");
    await until(() => host.game.turnIdx === 1, "차례 넘어감");
    const r = host.game.roundResults[0];
    assert.equal(r.player, host.me);
    assert.ok(r.score >= 2, "리액션 보너스 포함");
    assert.equal(host.game.scores[host.me!], r.score);
  });

  await t.test("진행자가 건너뛰기", async () => {
    host.send("skip");
    await until(() => host.game.turnIdx === 2, "건너뜀");
    assert.equal(host.game.roundResults[1].endedBy, "skip");
  });

  await t.test("리뷰", async () => {
    host.send("review");
    await until(() => host.game.phase === "review", "리뷰");
    assert.ok(host.game.review?.headline);
    await until(() => host.rounds[0]?.review, "기록에 리뷰 반영");
  });

  await t.test("늦게 온 사람은 다음 손님부터 근무표에", async () => {
    const late = new Player(code, tok("late"), "늦은이");
    await late.hello();
    host.send("newCustomer", {});
    await until(() => host.game.phase === "playing" && host.game.round === 2, "두 번째 손님");
    assert.ok(host.game.order.includes(late.me!));
    assert.equal(host.rounds.length, 2);
    late.close();
  });

  await t.test("진행자 넘겨받기: 진행자가 있으면 거절, 나가면 허용", async () => {
    friend.send("takeHost");
    await wait(300);
    assert.equal(friend.game.hostId, host.me);
    host.close();
    await wait(400);
    friend.send("takeHost");
    await until(() => friend.game.hostId === friend.me, "진행자 넘겨받음");
  });

  await t.test("가게 정리: 대기실로, 점수 초기화, 지난 손님은 유지", async () => {
    friend.send("close");
    await until(() => friend.game.phase === "lobby", "정리");
    assert.deepEqual(friend.game.scores, {});
    assert.equal(friend.rounds.length, 2);
  });

  friend.close(); viewer.close();
});

test("2분이 지나면 서버가 차례를 끝낸다 (E2E_SLOW=1)", { skip: !process.env.E2E_SLOW, timeout: 200000 }, async () => {
  const code = await newRoom();
  const p = new Player(code, tok("slow"), "느림");
  await p.hello();
  p.send("newCustomer", {});
  await until(() => p.game.phase === "playing", "손님");
  p.send("start");
  await until(() => p.game.turn?.status === "live", "시작");
  await until(() => p.game.turn?.status === "done", "시간 종료", 140000);
  assert.equal(p.game.turn!.endedBy, "time");
  p.close();
});
