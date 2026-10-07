import { staffOrder } from "../../../shared/game";
import { Avatar } from "../../components/Avatar";
import { useGame } from "./RoomContext";

/** 대기실에서는 참가 여부, 게임 중에는 응대 순서와 누적 점수를 보여 준다. */
export function Roster({ title, withScores }: { title: string; withScores?: boolean }) {
  const { g, online, nameOf } = useGame();
  const ids = withScores ? (g.order.length ? g.order : staffOrder(g.players)) : [...new Set([...staffOrder(g.players), ...online])];
  const done = new Set(g.roundResults.map((r) => r.player));
  const current = g.order[g.turnIdx];

  return (
    <div className="card tight">
      <div className="row spread">
        <span className="h3">{title}</span>
        <span className="tiny">{online.length}명 접속</span>
      </div>
      <div className="list">
        {ids.map((id) => {
          const p = g.players[id];
          const isCur = withScores && current === id && g.phase === "playing";
          const role = id === g.hostId ? "진행자" : p?.staff ? "직원" : "구경 중";
          return (
            <div key={id} className={isCur ? "li now" : "li"}>
              <Avatar id={id} nick={p?.nick} />
              <div className="txt">
                <b>{nameOf(id)}</b>
                <span>{role}</span>
              </div>
              {withScores ? (
                <>
                  <span className={`badge${done.has(id) ? " ok" : isCur ? " host" : ""}`}>
                    {done.has(id) ? "응대 끝" : isCur ? "응대 차례" : "대기"}
                  </span>
                  <span className="sc score">{g.scores[id] || 0}</span>
                </>
              ) : (
                <span className={p?.staff ? "badge ok" : "badge"}>{p?.staff ? "참가" : "구경"}</span>
              )}
              <span className={online.includes(id) ? "dot on" : "dot"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
