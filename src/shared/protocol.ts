import type { Game, Reaction, Round } from "./game";

/** 상태 메시지에는 지난 손님 기록(rounds)을 싣지 않는다. 판이 쌓일수록 커져서 바뀔 때만 따로 보낸다. */
export type GameState = Omit<Game, "rounds">;

export type ClientMessage =
  | { type: "hello"; token: string; nick: string }
  | { type: "join" }
  | { type: "spectate" }
  | { type: "takeHost" }
  | { type: "react"; e: Reaction }
  | { type: "newCustomer"; idea?: string }
  | { type: "start" }
  | { type: "say"; text: string }
  | { type: "retry" }
  | { type: "endTurn" }
  | { type: "skip" }
  | { type: "review" }
  | { type: "close" };

export type ServerMessage =
  | { type: "state"; g: GameState; online: string[] }
  | { type: "rounds"; rounds: Round[] }
  | { type: "you"; id: string }
  | { type: "react"; e: Reaction; from: string }
  | { type: "error"; msg: string };

export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;
