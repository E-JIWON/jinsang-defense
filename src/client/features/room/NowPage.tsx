import { useState } from "react";
import { Arriving } from "./Arriving";
import { Connecting } from "./Connecting";
import { Lobby } from "./Lobby";
import { PlayView } from "./PlayView";
import { useRoomContext } from "./RoomContext";

export function NowPage() {
  const { g, joined, connected } = useRoomContext();
  // 대기실과 리뷰 뒤 '다음 손님' 입력이 같은 값을 이어 쓴다.
  const [idea, setIdea] = useState("");

  if (!g || !joined) return <Connecting connected={connected} />;
  if (g.phase === "lobby") return <Lobby idea={idea} setIdea={setIdea} />;
  if (g.phase === "customer" || !g.customer) return <Arriving idea={idea} />;
  return <PlayView c={g.customer} idea={idea} setIdea={setIdea} />;
}
