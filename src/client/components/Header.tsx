import { Store } from "lucide-react";
import { useState } from "react";
import { pastRounds } from "../features/history/pastRounds";
import { useRoomContext } from "../features/room/RoomContext";
import { Avatar } from "./Avatar";

export type Tab = "now" | "past" | "rank";
const TABS: [Tab, string][] = [
  ["now", "지금 가게"],
  ["past", "지난 손님"],
  ["rank", "순위"],
];

function Brand() {
  return (
    <a className="brand" href="/">
      <i>
        <Store aria-hidden />
      </i>
      진상 손님 버티기
    </a>
  );
}

function CloseShop() {
  const { act } = useRoomContext();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button
        type="button"
        className="btn ghost"
        title="점수와 진행 중인 손님을 지우고 대기실로 (지난 손님 기록은 남아요)"
        onClick={() => setConfirm(true)}
      >
        가게 정리
      </button>
    );
  }
  return (
    <>
      <span>가게를 정리할까요?</span>
      <button
        type="button"
        className="btn rust sm"
        onClick={() => {
          setConfirm(false);
          act({ type: "close" });
        }}
      >
        정리
      </button>
      <button type="button" className="btn sm" onClick={() => setConfirm(false)}>
        취소
      </button>
    </>
  );
}

/** inRoom이 아니면(첫 화면, 초대 입장 화면) 탭과 접속자는 숨긴다. */
export function Header({ inRoom, tab, onTab }: { inRoom: boolean; tab: Tab; onTab: (t: Tab) => void }) {
  const { g, rounds, online, connected, isHost } = useRoomContext();
  const past = pastRounds(rounds, g).length;
  return (
    <header className="top">
      <Brand />
      {inRoom && (
        <nav className="tabs" aria-label="화면">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" className={tab === k ? "tab on" : "tab"} aria-pressed={tab === k} onClick={() => onTab(k)}>
              {label}
              {k === "past" && past > 0 && <small>{past}</small>}
            </button>
          ))}
        </nav>
      )}
      <div className="status">
        {inRoom && (
          <>
            <span className="faces">
              {online.slice(0, 4).map((id) => (
                <Avatar key={id} id={id} nick={g?.players[id]?.nick} size="sm" />
              ))}
            </span>
            {online.length}명{!connected && <span className="err">재연결 중</span>}
            {isHost && <CloseShop />}
          </>
        )}
      </div>
    </header>
  );
}
