import { Dices } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../../components/Avatar";
import { randomNick } from "../../lib/nick";
import { useRoomContext } from "../room/RoomContext";
import { PreviewChat } from "./PreviewChat";

/** 초대 링크로 들어온 친구: 메인과 같은 틀에 "누가 불렀는지 · 누가 와 있는지"를 보여 준다. */
export function JoinPage({ onEnter }: { onEnter: (nick: string) => void }) {
  const { code, g, online } = useRoomContext();
  const [nick, setNick] = useState("");
  const [error, setError] = useState("");
  const host = g?.hostId ? g.players[g.hostId]?.nick : undefined;
  const here = online.filter((id) => g?.players[id]);
  const names = here
    .map((id) => g?.players[id]?.nick)
    .slice(0, 3)
    .join(", ");

  return (
    <div className="hero">
      <div className="hero-copy">
        <div className="eyebrow">초대받은 가게 · {code}</div>
        <h1>
          {host ? `${host}님이` : "진상 손님 가게에"}
          <br />
          {host ? "같이 손님 받자고 해요" : "초대받았어요"}
        </h1>
        {here.length ? (
          <div className="row" style={{ gap: 10 }}>
            <span className="faces">
              {here.slice(0, 5).map((id) => (
                <Avatar key={id} id={id} nick={g?.players[id]?.nick} />
              ))}
            </span>
            <span className="sub">
              {names}
              {here.length > 3 ? ` 외 ${here.length - 3}명` : ""}이 와 있어요
            </span>
          </div>
        ) : (
          <p className="sub">{g ? "아직 아무도 없어요. 먼저 들어가서 기다려 보세요." : "가게에 연결하는 중…"}</p>
        )}
        <p className="sub">AI가 연기하는 진상 손님을 한 명씩 돌아가며 2분 동안 달래는 게임이에요. 닉네임만 쓰면 바로 직원으로 들어가요.</p>
        <form
          className="entry"
          onSubmit={(e) => {
            e.preventDefault();
            if (nick.trim()) onEnter(nick);
            else setError("닉네임을 먼저 적어 주세요.");
          }}
        >
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="내 닉네임"
            name="nick"
            aria-label="닉네임"
            autoComplete="off"
          />
          <button
            type="button"
            className="btn ghost dice"
            aria-label="랜덤 닉네임"
            title="랜덤 닉네임"
            onClick={() => {
              setNick(randomNick());
              setError("");
            }}
          >
            <Dices aria-hidden />
          </button>
          <button type="submit" className="btn solid">
            가게 들어가기
          </button>
        </form>
        {/* 문구가 생길 때 위아래가 밀리지 않게 자리를 늘 잡아 둔다. */}
        <p className="err err-slot" aria-live="polite">
          {error}
        </p>
      </div>
      <PreviewChat />
    </div>
  );
}
