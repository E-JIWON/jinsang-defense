// 기능 QA: 떠 있는 개발 서버(가짜 AI)에 여러 명이 웹소켓으로 붙어 한 판 전체를 확인한다.
//   npm run build && npx wrangler dev --port 8789 --var LLM_FAKE:1
//   BASE=http://localhost:8789 npm run e2e        (E2E_SLOW=1 이면 2분 시간 종료까지 확인)
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, test } from "vitest";
import type { Round } from "../src/shared/game";
import type { ClientMessage, GameState, ServerMessage } from "../src/shared/protocol";

const BASE = process.env.BASE || "http://localhost:8789";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(f: () => unknown, what: string, ms = 15_000) {
  const start = Date.now();
  while (!f()) {
    if (Date.now() - start > ms) throw new Error(`기다리다 시간 초과: ${what}`);
    await wait(50);
  }
}

class Player {
  ws: WebSocket;
  g: GameState | null = null;
  me: string | null = null;
  rounds: Round[] = [];
  errors: string[] = [];
  reacts: string[] = [];
  ready: Promise<void>;
  token: string;
  nick: string;

  constructor(code: string, token: string, nick: string) {
    this.token = token;
    this.nick = nick;
    this.ws = new WebSocket(`${BASE.replace("http", "ws")}/ws/${code}`);
    this.ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data)) as ServerMessage;
      if (m.type === "state") this.g = m.g;
      if (m.type === "you") this.me = m.id;
      if (m.type === "rounds") this.rounds = m.rounds;
      if (m.type === "error") this.errors.push(m.msg);
      if (m.type === "react") this.reacts.push(m.e);
    });
    this.ready = new Promise((r) => this.ws.addEventListener("open", () => r()));
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  async hello() {
    await this.ready;
    this.send({ type: "hello", token: this.token, nick: this.nick });
    await until(() => this.me, `${this.nick} 입장`);
  }

  get game() {
    if (!this.g) throw new Error("상태가 아직 없어요");
    return this.g;
  }

  get turn() {
    const t = this.game.turn;
    if (!t) throw new Error("차례가 없어요");
    return t;
  }

  close() {
    this.ws.close();
  }
}

const newRoom = async () => ((await (await fetch(`${BASE}/api/room`, { method: "POST" })).json()) as { code: string }).code;
const tok = (s: string) => `${s}-token-0123456789abcdef`.slice(0, 32);

describe("한 판 전체: 입장 → 손님 → 응대 → 리액션 → 실패/재시도 → 건너뛰기 → 리뷰 → 정리", () => {
  let code: string;
  let host: Player;
  let friend: Player;
  let viewer: Player;

  beforeAll(async () => {
    code = await newRoom();
    host = new Player(code, tok("host"), "봉칠");
    friend = new Player(code, tok("friend"), "성찬");
    viewer = new Player(code, tok("viewer"), "지영");
  });

  afterAll(() => {
    friend.close();
    viewer.close();
  });

  test("입장: 공개 id 받고, 기본은 직원, 첫 사람이 진행자", async () => {
    await host.hello();
    await friend.hello();
    await viewer.hello();
    await until(() => Object.keys(host.game.players).length === 3, "3명");
    assert.equal(host.game.hostId, host.me);
    assert.ok(host.game.players[friend.me!].staff);
    assert.equal(host.game.players[host.me!].nick, "봉칠");
    assert.equal("rounds" in host.game, false, "상태에는 rounds를 싣지 않는다");
  });

  test("구경 전환", async () => {
    viewer.send({ type: "spectate" });
    await until(() => host.game.players[viewer.me!].staff === false, "구경 전환");
  });

  test("사칭: 진행자 공개 id를 토큰으로 써도 다른 사람이 된다", async () => {
    const evil = new Player(code, `${host.me}zzzzzzzzzz`, "가짜");
    await evil.hello();
    assert.notEqual(evil.me, host.me);
    evil.send({ type: "close" });
    await wait(200);
    assert.equal(host.game.hostId, host.me);
    evil.send({ type: "spectate" });
    evil.close();
  });

  test("진행자가 아니면 손님을 못 부른다", async () => {
    friend.send({ type: "newCustomer" });
    await wait(300);
    assert.equal(host.game.phase, "lobby");
  });

  test("손님 입장: 직원만 근무표에", async () => {
    host.send({ type: "newCustomer", idea: "우리 회사 탕비실" });
    await until(() => host.game.phase === "playing", "손님 입장");
    assert.deepEqual(host.game.order, [host.me, friend.me]);
    assert.ok(host.game.customer?.name);
    assert.equal(host.rounds.length, 1, "지난 손님 기록은 rounds 메시지로 따로 온다");
  });

  test("내 차례가 아니면 시작 못 한다", async () => {
    friend.send({ type: "start" });
    await wait(300);
    assert.equal(host.game.turn, null);
  });

  test("응대: 대답·점수·리액션 보너스", async () => {
    host.send({ type: "start" });
    await until(() => host.game.turn?.status === "live", "응대 시작");
    host.send({ type: "say", text: "규정상 어렵지만 대안을 드릴게요" });
    await until(() => host.turn.msgs.length === 3, "손님 대답");
    assert.equal(typeof host.turn.msgs[1].g, "number");
    friend.send({ type: "react", e: "😂" });
    friend.send({ type: "react", e: "😂" }); // 두 번째는 연타 제한에 걸린다
    await wait(300);
    friend.send({ type: "react", e: "🔥" });
    await until(() => host.reacts.length >= 2, "리액션 전달");
    assert.equal(host.reacts.length, 2, "250ms 안 연타는 무시");
  });

  test("AI 실패 → 내 말은 남고 '다시 보내기' → 성공", async () => {
    host.send({ type: "say", text: "이건 실패할 말 #fail" });
    await until(() => host.turn.lastError, "실패 표시");
    const last = host.turn.msgs.at(-1)!;
    assert.equal(last.failed, true);
    assert.equal(host.turn.thinking, false);
    host.send({ type: "say", text: "다시 정중하게 말씀드릴게요" }); // 실패한 말은 새 말로 바뀐다
    await until(() => host.turn.msgs.at(-1)?.f === "c" && !host.turn.lastError, "재전송 대답");
    assert.equal(host.turn.msgs.filter((m) => m.failed).length, 0);
  });

  test("연타: 같은 말을 두 번 보내도 AI는 한 번만 부른다", async () => {
    const lines = () => host.turn.msgs.filter((m) => m.f === "p").length;
    const before = lines();
    host.send({ type: "say", text: "연타 확인" });
    host.send({ type: "say", text: "연타 확인" });
    await until(() => host.turn.msgs.at(-1)?.f === "c" && lines() > before, "대답");
    await wait(300);
    assert.equal(lines(), before + 1);
  });

  test("그만하기 → 점수 누적, 다음 차례", async () => {
    host.send({ type: "endTurn" });
    await until(() => host.game.turnIdx === 1, "차례 넘어감");
    const r = host.game.roundResults[0];
    assert.equal(r.player, host.me);
    assert.ok(r.score >= 2, "리액션 보너스 포함");
    assert.equal(host.game.scores[host.me!], r.score);
  });

  test("진행자가 건너뛰기", async () => {
    host.send({ type: "skip" });
    await until(() => host.game.turnIdx === 2, "건너뜀");
    assert.equal(host.game.roundResults[1].endedBy, "skip");
  });

  test("리뷰", async () => {
    host.send({ type: "review" });
    await until(() => host.game.phase === "review", "리뷰");
    assert.ok(host.game.review?.headline);
    await until(() => host.rounds[0]?.review, "기록에 리뷰 반영");
  });

  test("늦게 온 사람은 다음 손님부터 근무표에", async () => {
    const late = new Player(code, tok("late"), "늦은이");
    await late.hello();
    host.send({ type: "newCustomer" });
    await until(() => host.game.phase === "playing" && host.game.round === 2, "두 번째 손님");
    assert.ok(host.game.order.includes(late.me ?? ""));
    assert.equal(host.rounds.length, 2);
    late.close();
  });

  test("진행자 넘겨받기: 진행자가 있으면 거절, 나가면 허용", async () => {
    friend.send({ type: "takeHost" });
    await wait(300);
    assert.equal(friend.game.hostId, host.me);
    host.close();
    await wait(400);
    friend.send({ type: "takeHost" });
    await until(() => friend.game.hostId === friend.me, "진행자 넘겨받음");
  });

  test("가게 정리: 대기실로, 점수 초기화, 지난 손님은 유지", async () => {
    friend.send({ type: "close" });
    await until(() => friend.game.phase === "lobby", "정리");
    assert.deepEqual(friend.game.scores, {});
    assert.equal(friend.rounds.length, 2);
  });

  test("정리 뒤 다음 손님은 번호를 이어 세서 지난 기록을 덮지 않는다", async () => {
    friend.send({ type: "newCustomer" });
    await until(() => friend.game.phase === "playing", "정리 뒤 손님");
    assert.equal(friend.game.round, 3);
    await until(() => friend.rounds.length === 3, "기록 3개");
  });
});

test.skipIf(!process.env.E2E_SLOW)("2분이 지나면 서버가 차례를 끝낸다", { timeout: 200_000 }, async () => {
  const p = new Player(await newRoom(), tok("slow"), "느림");
  await p.hello();
  p.send({ type: "newCustomer" });
  await until(() => p.game.phase === "playing", "손님");
  p.send({ type: "start" });
  await until(() => p.game.turn?.status === "live", "시작");
  await until(() => p.game.turn?.status === "done", "시간 종료", 140_000);
  assert.equal(p.turn.endedBy, "time");
  p.close();
});

describe("방 막기 방지", () => {
  test("유령 30명으로 꽉 찬 방에도 새 사람이 들어온다", async () => {
    const code = await newRoom();
    const host = new Player(code, tok("ghost-host"), "주인");
    await host.hello();
    const ghosts = Array.from({ length: 29 }, (_, i) => new Player(code, tok(`ghost${i}`), `유령${i}`));
    await Promise.all(ghosts.map((p) => p.hello()));
    await until(() => Object.keys(host.game.players).length === 30, "30명");
    for (const p of ghosts) p.close();
    await wait(300);
    const real = new Player(code, tok("ghost-real"), "진짜");
    await real.hello();
    assert.ok(real.game.players[real.me ?? ""], "들어옴");
    assert.ok(real.game.players[host.me ?? ""], "진행자는 남음");
    host.close();
    real.close();
  });

  test("리액션 보너스는 구경꾼 한 명당 한 차례 3번까지", async () => {
    const code = await newRoom();
    const a = new Player(code, tok("react-a"), "응대");
    const b = new Player(code, tok("react-b"), "구경");
    await a.hello();
    await b.hello();
    b.send({ type: "spectate" });
    await until(() => a.game.players[b.me ?? ""]?.staff === false, "구경 전환");
    a.send({ type: "newCustomer" });
    await until(() => a.game.phase === "playing", "손님");
    a.send({ type: "start" });
    await until(() => a.game.turn?.status === "live", "시작");
    for (let i = 0; i < 5; i++) {
      b.send({ type: "react", e: "🔥" });
      await wait(300);
    }
    await until(() => a.reacts.length === 5, "리액션 5번 전달");
    a.send({ type: "endTurn" });
    await until(() => a.game.turn?.status === "done", "차례 끝");
    assert.equal(a.turn.bonus, 6, "3번 × 2점");
    a.close();
    b.close();
  });
});
