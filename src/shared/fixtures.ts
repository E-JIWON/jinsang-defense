// 테스트 전용 고정 데이터.
import type { Customer, Turn } from "./game";

export const customer: Customer = {
  name: "손님",
  place: "카페",
  staff: "알바",
  goal: "",
  want: "",
  tags: [],
  situation: "",
  opening: "저기요",
  anger: 50,
};

export function liveTurn(): Turn {
  return {
    player: "a",
    status: "live",
    anger: 50,
    msgs: [
      { f: "c", t: "저기요" },
      { f: "p", t: "네" },
    ],
    thinking: true,
    clock: { spent: 10_000, resumeAt: null },
    points: 0,
    reacts: 3,
    lastError: null,
  };
}
