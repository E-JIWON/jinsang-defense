import { describe, expect, test } from "vitest";
import { customer, liveTurn } from "./fixtures";
import { applyReply, endTurn, freshGame, type Game, parseJson, skipTurn, TURN_MS, type Turn } from "./game";

function playing(): Game & { turn: Turn } {
  return { ...freshGame(), phase: "playing", round: 1, order: ["a", "b"], customer, turn: liveTurn() };
}

describe("applyReply", () => {
  test("점수 누적, 분노 갱신, 시계 재개", () => {
    const t = liveTurn();
    expect(applyReply(t, { grade: 15, why: "센스", reply: "흠", anger: 30 }, 1000)).toBeNull();
    expect(t).toMatchObject({ points: 15, anger: 30, thinking: false, clock: { resumeAt: 1000 } });
    expect(t.msgs.at(-2)?.g).toBe(15);
  });

  test("끝 조건: 폭발·만족·시간", () => {
    expect(applyReply(liveTurn(), { grade: 0, anger: 120 })).toBe("boom");
    expect(applyReply(liveTurn(), { grade: 20, anger: 2 })).toBe("happy");
    const t = liveTurn();
    t.clock.spent = TURN_MS;
    expect(applyReply(t, { grade: 10, anger: 50 }, 0)).toBe("time");
  });

  test("AI가 엉뚱한 값을 줘도 범위 안으로", () => {
    const t = liveTurn();
    applyReply(t, { grade: "999", anger: "abc" });
    expect(t.points).toBe(20);
    expect(t.anger).toBe(50);
  });
});

describe("endTurn", () => {
  test("응대 합 + 만족 30 + 리액션 보너스, 누적·기록", () => {
    const g = playing();
    g.turn.points = 40;
    endTurn(g, "happy", 0);
    expect(g.turn.score).toBe(40 + 30 + 6);
    expect(g.scores.a).toBe(76);
    expect(g.turnIdx).toBe(1);
    expect(g.rounds).toHaveLength(1);

    skipTurn(g);
    expect(g.roundResults.at(-1)?.endedBy).toBe("skip");
    expect(g.rounds).toHaveLength(1);
  });

  test("폭발하면 보너스 없음", () => {
    const g = playing();
    g.turn.points = 40;
    endTurn(g, "boom", 0);
    expect(g.turn.score).toBe(40);
  });
});

test("parseJson: 코드펜스·앞뒤 잡담 허용", () => {
  expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJson('네! {"a":{"b":2}} 끝')).toEqual({ a: { b: 2 } });
  expect(() => parseJson("없음")).toThrow();
});
