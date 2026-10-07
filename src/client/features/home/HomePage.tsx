import { useState } from "react";
import { ROOM_CODE } from "../../../shared/protocol";
import { PreviewChat } from "./PreviewChat";

type Props = { initialNick: string; onEnter: (code: string, nick: string) => void };

export function HomePage({ initialNick, onEnter }: Props) {
  const [nick, setNick] = useState(initialNick);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);

  const open = async () => {
    if (!nick.trim()) return setError("닉네임을 먼저 적어 주세요.");
    setOpening(true);
    const res = await fetch("/api/room", { method: "POST" })
      .then((r) => r.json() as Promise<{ code?: string; error?: string }>)
      .catch(() => null);
    setOpening(false);
    if (res?.code) onEnter(res.code, nick);
    else setError(res?.error || "가게를 열지 못했어요. 다시 눌러 주세요.");
  };

  const join = () => {
    const c = code.trim().toUpperCase();
    if (!nick.trim()) return setError("닉네임을 먼저 적어 주세요.");
    if (!ROOM_CODE.test(c)) return setError("가게 코드를 확인해 주세요.");
    onEnter(c, nick);
  };

  return (
    <div className="card hero">
      <div className="hero-copy">
        <div className="eyebrow">친구들과 · 2~6명 · 로그인 없이</div>
        <h1>
          진상 손님을
          <br />
          2분만 버텨보세요
        </h1>
        <p className="sub">AI가 진상 손님을 연기해요. 한 명씩 돌아가며 말로 달래고, 나머지는 실시간으로 구경하며 리액션을 던져요.</p>
        <ol className="steps">
          <li>
            <span>
              <b>가게를 열고 </b>링크를 단톡방에 보내요
            </span>
          </li>
          <li>
            <span>
              <b>2분씩 응대 </b>한마디마다 점수가 붙어요
            </span>
          </li>
          <li>
            <span>
              <b>손님 리뷰 </b>별점과 누적 순위가 나와요
            </span>
          </li>
        </ol>
        <div className="stack">
          <form
            className="entry"
            onSubmit={(e) => {
              e.preventDefault();
              open();
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
            <button type="submit" className="btn solid" disabled={opening}>
              새 가게 열기
            </button>
          </form>
          <form
            className="alt-entry"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <span>친구 가게 코드가 있다면</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
              placeholder="K7QPX"
              autoCapitalize="characters"
              name="code"
              aria-label="가게 코드"
            />
            <button type="submit" className="btn">
              입장
            </button>
          </form>
        </div>
        {error && <p className="err">{error}</p>}
      </div>
      <PreviewChat />
    </div>
  );
}
