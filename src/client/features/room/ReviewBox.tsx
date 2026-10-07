import type { Result, Review } from "../../../shared/game";
import { Avatar } from "../../components/Avatar";
import { useGame } from "./RoomContext";

export function ReviewBox({ review, results }: { review: Review; results: Result[] }) {
  const { g, nameOf } = useGame();
  const scoreOf = (id: string) => results.find((r) => r.player === id)?.score ?? 0;
  const items = [...review.items].sort((a, b) => scoreOf(b.player) - scoreOf(a.player));
  return (
    <div className="review">
      <div className="eyebrow">손님 리뷰</div>
      {review.headline && <div className="hd">“{review.headline}”</div>}
      {items.map((it) => (
        <div key={it.player} className="rv">
          <Avatar id={it.player} nick={g.players[it.player]?.nick} size="sm" />
          <div className="row nowrap">
            <b>{nameOf(it.player)}</b>
            <span className="stars" role="img" aria-label={`별 ${it.stars}개`}>
              {"★".repeat(it.stars) + "☆".repeat(5 - it.stars)}
            </span>
          </div>
          <span className="sc">+{scoreOf(it.player)}</span>
          <p>{it.review}</p>
        </div>
      ))}
    </div>
  );
}
