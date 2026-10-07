import { useEffect, useState } from "react";
import type { Msg } from "../../../shared/game";
import { Face } from "../../components/Face";
import { reducedMotion, stickBottom } from "../../lib/scroll";
import { useGame } from "./RoomContext";

// 탭을 옮겨 다시 그려져도 이미 다 나온 대사는 다시 타이핑하지 않는다.
const typed = new Set<string>();

function useTyping(text: string, key: string | null) {
  const animate = key !== null && !reducedMotion && !typed.has(key);
  const [n, setN] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (key === null || typed.has(key) || reducedMotion) return setN(text.length);
    typed.add(key);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i % 12 === 0) stickBottom();
      if (i >= text.length) {
        clearInterval(id);
        stickBottom();
      }
    }, 28);
    return () => {
      clearInterval(id);
      // 다 나오기 전에 사라졌으면(StrictMode 재실행 포함) 다음에 다시 타이핑한다.
      if (i < text.length) typed.delete(key);
    };
  }, [text, key]);

  return { shown: text.slice(0, n), done: n >= text.length };
}

function CustomerLine({ m, anger, typeKey }: { m: Msg; anger: number; typeKey: string | null }) {
  const { shown, done } = useTyping(m.t, typeKey);
  return (
    <div className="mc">
      <Face anger={anger} small />
      <div className="body">
        <div className="bubble">{shown}</div>
        {done && (m.act || m.thought) && (
          <div className="meta">
            {m.act && <span className="act">{m.act}</span>}
            {m.thought && <span className="thought">속마음 · {m.thought}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffLine({ m, canRetry }: { m: Msg; canRetry: boolean }) {
  const { act } = useGame();
  const tone = m.g == null ? "" : m.g >= 12 ? " good" : m.g <= 6 ? " bad" : "";
  return (
    <div className="mp">
      <div className={m.failed ? "bubble failed" : "bubble"}>{m.t}</div>
      {m.failed ? (
        <div className="meta">
          <span className="chip bad">전송 실패</span>
          {canRetry && (
            <button type="button" className="btn solid retry" onClick={() => act({ type: "retry" })}>
              다시 보내기
            </button>
          )}
        </div>
      ) : (
        m.g != null && (
          <div className="meta">
            <span className={`chip${tone}`}>
              +{m.g}
              {m.why ? ` · ${m.why}` : ""}
            </span>
          </div>
        )
      )}
    </div>
  );
}

/** live면 지금 진행 중인 차례: 마지막 손님 대사를 타이핑하고, 내 차례면 실패한 말을 다시 보낼 수 있다. */
export function Messages({ msgs, liveKey }: { msgs: Msg[]; liveKey?: string }) {
  const { g, me } = useGame();
  const anger = g.customer?.anger ?? 50;
  const mine = !!liveKey && g.turn?.player === me;
  return msgs.map((m, i) => {
    const key = `${liveKey}:${i}`;
    if (m.f === "p") return <StaffLine key={key} m={m} canRetry={mine} />;
    const typeKey = liveKey && i > 0 && i === msgs.length - 1 ? key : null;
    return <CustomerLine key={key} m={m} anger={anger} typeKey={typeKey} />;
  });
}
