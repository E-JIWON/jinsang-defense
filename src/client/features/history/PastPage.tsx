import { useState } from "react";
import { Face } from "../../components/Face";
import { CustomerDetails } from "../room/CustomerInfo";
import { DoneTurn } from "../room/DoneTurn";
import { ReviewBox } from "../room/ReviewBox";
import { useGame } from "../room/RoomContext";
import { pastRounds } from "./pastRounds";

export function PastPage() {
  const { g, rounds, me } = useGame();
  const [openRound, setOpenRound] = useState<number | null>(null);
  const list = pastRounds(rounds, g);
  const r = rounds.find((x) => x.round === openRound);

  if (r?.customer) {
    const rs = r.results;
    return (
      <div className="narrow">
        <button type="button" className="btn ghost back" onClick={() => setOpenRound(null)}>
          ← 지난 손님
        </button>
        <div className="card tight">
          <div className="row nowrap" style={{ gap: 12 }}>
            <Face anger={rs.at(-1)?.anger ?? r.customer.anger} />
            <div style={{ minWidth: 0 }}>
              <b>{r.customer.name}</b>
              <div className="tiny">
                {r.round}번째 손님 · 직원 {rs.length}명{r.review ? "" : " · 리뷰 전에 끝남"}
              </div>
            </div>
          </div>
          <CustomerDetails c={r.customer} />
        </div>
        <div className="thread">
          {rs.map((x) => (
            <DoneTurn key={x.player} r={x} openByDefault />
          ))}
          {!rs.length && <p className="pill">응대 기록이 없어요.</p>}
          {r.review && <ReviewBox review={r.review} results={rs} />}
        </div>
      </div>
    );
  }

  if (!list.length) {
    return (
      <div className="narrow">
        <div className="card">
          <h2 className="empty-title">아직 지난 손님이 없어요</h2>
          <p className="sub">응대가 하나 끝날 때마다 여기에 쌓여요. 손님을 눌러 그때 대화를 다시 볼 수 있어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="card tight">
        <span className="h3">지난 손님 {list.length}명</span>
        <div className="list">
          {list.map((x) => {
            const mine = x.results.find((y) => y.player === me);
            return (
              <button
                key={x.round}
                type="button"
                className="li"
                onClick={() => {
                  setOpenRound(x.round);
                  window.scrollTo(0, 0);
                }}
              >
                <Face anger={x.results.at(-1)?.anger ?? x.customer?.anger ?? 50} small />
                <div className="txt">
                  <b>{x.customer?.name || "손님"}</b>
                  <span>{x.review?.headline ? `“${x.review.headline}”` : `${x.customer?.place || ""} · 직원 ${x.results.length}명`}</span>
                </div>
                {mine ? <span className="sc">+{mine.score}</span> : <span className="tiny">구경</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
