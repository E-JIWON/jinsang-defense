import type { ReactNode } from "react";
import { useGame } from "./RoomContext";

// hint: 입력 도크 안에 들어갈 때 도크 줄 간격에 맞춘다.
const wrap = (el: ReactNode, hint?: boolean) => (hint ? <div className="hint">{el}</div> : el);

export function ErrorLine({ hint }: { hint?: boolean }) {
  const { error, g } = useGame();
  const msg = error || g.lastError;
  return msg ? wrap(<p className="err">{msg}</p>, hint) : null;
}

/** 진행자가 나가면 게임이 멈추니, 남은 직원 누구나 진행을 이어받을 수 있게. */
export function HostAway({ hint }: { hint?: boolean }) {
  const { g, online, me, isHost, nameOf, act } = useGame();
  const away = g.hostId && !online.includes(g.hostId) && !isHost && me && g.players[me]?.staff;
  if (!away) return null;
  return wrap(
    <div className="row">
      <span className="sub">진행자 {nameOf(g.hostId)}님이 자리를 비웠어요.</span>
      <button type="button" className="btn" onClick={() => act({ type: "takeHost" })}>
        내가 진행할게요
      </button>
    </div>,
    hint,
  );
}
