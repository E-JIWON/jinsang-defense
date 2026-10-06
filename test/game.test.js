import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, applyReply, endTurn, skipTurn, parseJson, TURN_MS } from "../src/game.js";

function playing() {
  const g = fresh();
  Object.assign(g, { phase: "playing", round: 1, order: ["a", "b"], customer: { name: "손님", anger: 50, opening: "저기요" } });
  g.turn = { player: "a", status: "live", anger: 50, msgs: [{ f: "c", t: "저기요" }, { f: "p", t: "네" }], thinking: true, clock: { spent: 10000, resumeAt: null }, points: 0, reacts: 3 };
  return g;
}

test("손님 대답 반영: 점수 누적, 분노 갱신, 시계 재개", () => {
  const g = playing();
  const end = applyReply(g.turn, { grade: 15, why: "센스", reply: "흠", anger: 30 }, 1000);
  assert.equal(end, null);
  assert.equal(g.turn.points, 15);
  assert.equal(g.turn.anger, 30);
  assert.equal(g.turn.msgs.at(-2).g, 15);
  assert.equal(g.turn.clock.resumeAt, 1000);
  assert.equal(g.turn.thinking, false);
});

test("끝 조건: 폭발·만족·시간", () => {
  assert.equal(applyReply(playing().turn, { grade: 0, anger: 120 }), "boom");
  assert.equal(applyReply(playing().turn, { grade: 20, anger: 2 }), "happy");
  const t = playing().turn; t.clock.spent = TURN_MS;
  assert.equal(applyReply(t, { grade: 10, anger: 50 }, 0), "time");
});

test("차례 종료 점수: 응대 합 + 보너스, 폭발이면 보너스 없음, 누적", () => {
  const g = playing(); g.turn.points = 40; g.turn.thinking = false;
  endTurn(g, "happy", 0);
  assert.equal(g.turn.score, 40 + 30 + 6);
  assert.equal(g.scores.a, 76);
  assert.equal(g.turnIdx, 1);
  assert.equal(g.rounds.length, 1);
  const g2 = playing(); g2.turn.points = 40; endTurn(g2, "boom", 0);
  assert.equal(g2.turn.score, 40);
  skipTurn(g); assert.equal(g.roundResults.at(-1).endedBy, "skip"); assert.equal(g.rounds.length, 1);
});

test("AI 응답 JSON 꺼내기: 코드펜스·앞뒤 잡담 허용", () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('네! {"a":{"b":2}} 끝'), { a: { b: 2 } });
  assert.throws(() => parseJson("없음"));
});
