import type { Round } from "../../../shared/game";
import type { GameState } from "../../../shared/protocol";

/** 지금 진행 중인 손님은 '지금 가게'에 있으니 지난 손님 목록에서는 뺀다. */
export const pastRounds = (rounds: Round[], g: GameState | null) =>
  rounds.filter((r) => !(g && r.round === g.round && ["playing", "review", "reviewing"].includes(g.phase))).sort((a, b) => b.at - a.at);
