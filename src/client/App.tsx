import { useState } from "react";
import { ROOM_CODE } from "../shared/protocol";
import { Header, type Tab } from "./components/Header";
import { Toasts } from "./components/Toasts";
import { PastPage } from "./features/history/PastPage";
import { RankPage } from "./features/history/RankPage";
import { HomePage } from "./features/home/HomePage";
import { JoinPage } from "./features/home/JoinPage";
import { NowPage } from "./features/room/NowPage";
import { RoomContext } from "./features/room/RoomContext";
import { usePath } from "./hooks/usePath";
import { useRoom } from "./hooks/useRoom";
import { stickBottom } from "./lib/scroll";
import { NICK_KEY, storage } from "./lib/storage";

const codeOf = (path: string) => {
  const c = path.match(/^\/r\/([^/]+)/)?.[1]?.toUpperCase();
  return c && ROOM_CODE.test(c) ? c : null;
};

export function App() {
  const [path, navigate] = usePath();
  const code = codeOf(path);
  const [nick, setNick] = useState(() => storage.get(NICK_KEY) ?? "");
  const [tab, setTab] = useState<Tab>("now");
  // 탭을 다시 누르면 그 화면을 처음 상태(지난 손님 목록 등)로 되돌린다.
  const [tabVisit, setTabVisit] = useState(0);
  // 초대 링크로 처음 온 사람은 닉네임부터. 그동안에도 방 상태는 받아서 누가 있는지 보여 준다.
  const needNick = !!code && !nick;
  const room = useRoom(code, needNick ? null : nick);
  const inRoom = !!code && !!room.g && !needNick;

  const enter = (roomCode: string, value: string) => {
    const v = value.trim();
    setNick(v);
    storage.set(NICK_KEY, v);
    setTab("now");
    if (roomCode !== code) navigate(`/r/${roomCode}`);
    window.scrollTo(0, 0);
  };

  const changeTab = (t: Tab) => {
    setTab(t);
    setTabVisit((n) => n + 1);
    if (t === "now" && room.g?.turn?.status === "live" && room.g.turn.player === room.me) stickBottom(true);
  };

  return (
    <RoomContext value={room}>
      <div className="app">
        <Header inRoom={inRoom} tab={tab} onTab={changeTab} />
        <main>
          {!code ? (
            <HomePage initialNick={nick} onEnter={enter} />
          ) : needNick ? (
            <JoinPage onEnter={(v) => enter(code, v)} />
          ) : tab === "past" && room.g ? (
            <PastPage key={tabVisit} />
          ) : tab === "rank" && room.g ? (
            <RankPage />
          ) : (
            <NowPage />
          )}
        </main>
      </div>
      <Toasts />
    </RoomContext>
  );
}
