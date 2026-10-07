import { useEffect } from "react";
import type { Customer } from "../../../shared/game";
import { MAX_LINES } from "../../../shared/game";
import { Avatar } from "../../components/Avatar";
import { Typing } from "../../components/Typing";
import { stickBottom } from "../../lib/scroll";
import { CustomerBar } from "./CustomerBar";
import { CustomerDetails, RoleLine } from "./CustomerInfo";
import { Dock } from "./Dock";
import { DoneTurn } from "./DoneTurn";
import { copyInvite } from "./InviteBox";
import { Messages } from "./Messages";
import { ReviewBox } from "./ReviewBox";
import { useGame } from "./RoomContext";
import { Roster } from "./Roster";

type Props = { c: Customer; idea: string; setIdea: (v: string) => void };

export function PlayView({ c, idea, setIdea }: Props) {
  const { g, me, code, floaties, nameOf, act } = useGame();
  const t = g.turn;
  const live = t?.status === "live" ? t : null;
  const rs = g.roundResults;
  const cur = g.order[g.turnIdx];
  const anger = live ? live.anger : (rs.at(-1)?.anger ?? c.anger);

  const sub = live
    ? `${nameOf(live.player)} 응대 중 · ${live.points}점 · ${live.msgs.filter((m) => m.f === "p").length}/${MAX_LINES}마디`
    : g.phase === "review"
      ? `${g.round}번째 손님 · 리뷰 도착`
      : g.phase === "reviewing"
        ? `${g.round}번째 손님 · 리뷰 쓰는 중`
        : cur
          ? `${g.round}번째 손님 · 다음 ${nameOf(cur)}`
          : `${g.round}번째 손님 · 모두 응대 끝`;

  // 응대 중엔 새 대사를 따라 내려간다(위로 올려 읽는 중이면 그대로, 내 차례면 항상).
  const lines = live?.msgs.length ?? 0;
  useEffect(() => {
    if (lines || live?.thinking) stickBottom(live?.player === me);
  }, [lines, live?.thinking, live?.player, me]);

  return (
    <div className="shell">
      <section className="chatcol">
        <CustomerBar c={c} anger={anger} sub={sub} turn={t} />
        <div className="thread">
          {!rs.length && !live && <div className="pill">{c.name} 손님이 들어왔어요</div>}
          {rs.map((r, i) => (
            <DoneTurn key={r.player} r={r} openByDefault={!live && g.phase === "playing" && i === rs.length - 1} />
          ))}
          {live && (
            <>
              <div className="pill">
                <Avatar id={live.player} nick={g.players[live.player]?.nick} size="sm" />
                <b>{nameOf(live.player)}</b>응대 중
              </div>
              <Messages msgs={live.msgs} liveKey={`${g.round}:${live.player}`} />
              {live.thinking && <Typing anger={live.anger} />}
              {live.lastError && <p className="pill danger">{live.lastError}</p>}
            </>
          )}
          {!live && g.phase === "playing" && <div className="pill">{cur ? `다음 차례 · ${nameOf(cur)}` : "모두 응대했어요"}</div>}
          {g.phase === "review" && g.review && <ReviewBox review={g.review} results={rs} />}
          {g.phase === "reviewing" && (
            <>
              <div className="pill">손님이 리뷰를 쓰는 중…</div>
              <Typing anger={anger} />
            </>
          )}
          {floaties.map((f) => (
            <span key={f.id} className="floaty" style={{ left: `${f.left}%` }}>
              {f.e}
            </span>
          ))}
        </div>
        <Dock idea={idea} setIdea={setIdea} />
      </section>
      <aside className="side play">
        <div className="card tight">
          <span className="h3">오늘의 손님</span>
          <CustomerDetails c={c} />
          <RoleLine c={c} divided />
        </div>
        <Roster title="근무표 · 누적 점수" withScores />
        <div className="card tight">
          <div className="row spread">
            <span className="h3">친구 부르기</span>
            <span className="code">{code}</span>
          </div>
          <button type="button" className="btn block" onClick={() => code && copyInvite(code)}>
            초대 링크 복사
          </button>
          {me && !g.players[me]?.staff && (
            <button type="button" className="btn solid block" onClick={() => act({ type: "join" })}>
              다음 손님부터 직원으로 참가
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
