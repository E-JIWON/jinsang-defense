import { TURN_MS } from "../../../shared/game";
import { Typing } from "../../components/Typing";
import { formatClock } from "../../lib/format";
import { ErrorLine } from "./Notices";
import { useGame } from "./RoomContext";
import { Roster } from "./Roster";

/** 손님을 만드는 동안 대화 화면과 같은 자리에 뼈대만 그려서 레이아웃이 흔들리지 않게 한다. */
export function Arriving({ idea }: { idea: string }) {
  const { isHost, act } = useGame();
  return (
    <div className="shell">
      <section className="chatcol">
        <div className="custbar">
          <div className="cb-row static">
            <div className="face skelbox" />
            <div className="cb-main">
              <span className="cb-name">손님이 들어오는 중…</span>
              <div className="meter">
                <i className="skelbar" style={{ width: "100%" }} />
              </div>
              <span className="cb-sub">보통 3~10초 걸려요</span>
            </div>
            <span className="clock idle">{formatClock(TURN_MS)}</span>
          </div>
        </div>
        <div className="thread">
          <Typing />
        </div>
        <div className="dock">
          <div className="panel">
            <div className="hint">
              <span>딸랑, 문이 열리고 있어요</span>
              {isHost && (
                <button type="button" className="btn ghost" onClick={() => act({ type: "newCustomer", idea })}>
                  너무 오래 걸리면 다시 시도
                </button>
              )}
            </div>
            <ErrorLine hint />
          </div>
        </div>
      </section>
      <aside className="side play">
        <Roster title="근무표 · 누적 점수" withScores />
      </aside>
    </div>
  );
}
