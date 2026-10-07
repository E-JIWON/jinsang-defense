import { useState } from "react";
import { Arriving } from "./Arriving";
import { Lobby } from "./Lobby";
import { PlayView } from "./PlayView";
import { useRoomContext } from "./RoomContext";

export function NowPage() {
  const { g, connected } = useRoomContext();
  // 대기실과 리뷰 뒤 '다음 손님' 입력이 같은 값을 이어 쓴다.
  const [idea, setIdea] = useState("");

  if (!g) {
    return (
      <div className="narrow">
        <div className="card">
          <p className="sub">{connected ? "가게 문 여는 중…" : "가게에 연결하는 중…"}</p>
        </div>
      </div>
    );
  }
  if (g.phase === "lobby") return <Lobby idea={idea} setIdea={setIdea} />;
  if (g.phase === "customer" || !g.customer) return <Arriving idea={idea} />;
  return <PlayView c={g.customer} idea={idea} setIdea={setIdea} />;
}
