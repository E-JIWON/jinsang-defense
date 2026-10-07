import { createContext, use } from "react";
import type { RoomApi } from "../../hooks/useRoom";

export const RoomContext = createContext<RoomApi | null>(null);

export function useRoomContext(): RoomApi {
  const room = use(RoomContext);
  if (!room) throw new Error("RoomContext 밖에서 쓰였어요");
  return room;
}

/** 방 상태가 도착한 뒤에만 그려지는 화면에서 쓴다. */
export function useGame() {
  const room = useRoomContext();
  if (!room.g) throw new Error("방 상태가 아직 없어요");
  return { ...room, g: room.g };
}
