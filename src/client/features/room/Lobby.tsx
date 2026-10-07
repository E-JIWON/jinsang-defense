import { staffOrder } from "../../../shared/game";
import { InviteBox } from "./InviteBox";
import { ErrorLine, HostAway } from "./Notices";
import { useGame } from "./RoomContext";
import { Roster } from "./Roster";

export function Lobby({ idea, setIdea }: { idea: string; setIdea: (v: string) => void }) {
  const { g, me, isHost, nameOf, act } = useGame();
  const joined = !!me && g.players[me]?.staff;
  const staff = staffOrder(g.players).length;

  return (
    <div className="shell">
      <section className="chatcol lobbycol">
        <div className="card lobby">
          <div className="stack tight">
            <div className="eyebrow">대기실</div>
            <h2 className="lobby-title">{isHost ? "친구를 부르고 첫 손님을 받아요" : "곧 손님이 들어와요"}</h2>
            <p className="sub">
              {isHost
                ? "모두 들어오면 시작하세요. 늦게 온 친구는 다음 손님부터 같이 해요."
                : `진행자 ${nameOf(g.hostId)}님이 손님을 받으면 시작돼요.`}
            </p>
          </div>
          <InviteBox />
          {isHost && (
            <form
              className="startrow"
              onSubmit={(e) => {
                e.preventDefault();
                act({ type: "newCustomer", idea });
              }}
            >
              <input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                maxLength={60}
                placeholder="손님이 나타날 장소 (비우면 랜덤)"
                name="idea"
                aria-label="손님이 나타날 장소"
              />
              <button type="submit" className="btn solid lg" disabled={!staff}>
                손님 받기 · {staff}명
              </button>
            </form>
          )}
          <div className="row spread">
            <span className="tiny">{joined ? "나는 직원으로 참가 중" : "나는 구경 중"}</span>
            <button type="button" className="btn ghost" onClick={() => act({ type: joined ? "spectate" : "join" })}>
              {joined ? "이번엔 구경만 할게요" : "직원으로 참가"}
            </button>
          </div>
          <HostAway />
          <ErrorLine />
        </div>
      </section>
      <aside className="side">
        <Roster title="참가자" />
      </aside>
    </div>
  );
}
