import type { Round } from "../../../shared/game";
import { Avatar } from "../../components/Avatar";
import { useGame } from "../room/RoomContext";

function statsOf(rounds: Round[], id: string) {
  const turns = rounds.flatMap((r) => r.results.filter((x) => x.player === id));
  const graded = turns.flatMap((x) => x.msgs.filter((m) => m.f === "p" && m.g != null).map((m) => m.g as number));
  const avg = graded.length ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 10) / 10 : 0;
  return {
    turns: turns.length,
    happy: turns.filter((x) => x.endedBy === "happy").length,
    boom: turns.filter((x) => x.endedBy === "boom").length,
    avg,
  };
}

export function RankPage() {
  const { g, rounds, nameOf } = useGame();
  const ids = Object.keys(g.scores).sort((a, b) => g.scores[b] - g.scores[a]);

  if (!ids.length) {
    return (
      <div className="narrow">
        <div className="card">
          <h2 className="empty-title">아직 순위가 없어요</h2>
          <p className="sub">첫 손님을 응대하면 누적 점수가 쌓여요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="card tight">
        <span className="h3">누적 순위 · 손님 {g.round}명째</span>
        <div className="list">
          {ids.map((id, i) => {
            const s = statsOf(rounds, id);
            return (
              <div key={id} className="li">
                <span className="no">{i + 1}</span>
                <Avatar id={id} nick={g.players[id]?.nick} size="lg" />
                <div className="txt">
                  <b>{nameOf(id)}</b>
                  <span>
                    응대 {s.turns}번 · 한마디 평균 {s.avg}점 · 만족 {s.happy} · 폭발 {s.boom}
                  </span>
                </div>
                <span className="sc">{g.scores[id]}점</span>
              </div>
            );
          })}
        </div>
        <p className="tiny">점수 = 한마디마다 받은 응대 점수 합 + 만족 퇴장 30 + 리액션 보너스(최대 20)</p>
      </div>
    </div>
  );
}
