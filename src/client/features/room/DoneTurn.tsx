import { useState } from "react";
import { OUTCOME, type Result } from "../../../shared/game";
import { Avatar } from "../../components/Avatar";
import { Messages } from "./Messages";
import { useGame } from "./RoomContext";

/** 끝난 차례 한 줄 요약. 대화는 접어 두고 필요할 때 펼친다. */
export function DoneTurn({ r, openByDefault }: { r: Result; openByDefault: boolean }) {
  const { g, nameOf } = useGame();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? openByDefault;
  return (
    <>
      <div className="pill">
        <Avatar id={r.player} nick={g.players[r.player]?.nick} size="sm" />
        <b>{nameOf(r.player)}</b>응대 · {OUTCOME[r.endedBy]} ·<span className="plus">+{r.score}</span>
      </div>
      {r.msgs.length > 0 && open && <Messages msgs={r.msgs} />}
      {r.msgs.length > 0 && (
        <button type="button" className="fold" onClick={() => setToggled(!open)}>
          {open ? "접기" : `대화 ${r.msgs.length}개 보기`}
        </button>
      )}
    </>
  );
}
