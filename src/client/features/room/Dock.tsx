import { ArrowUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { REACTS } from "../../../shared/game";
import { Elapsed } from "../../components/Elapsed";
import { stickBottom } from "../../lib/scroll";
import { ErrorLine, HostAway } from "./Notices";
import { useGame } from "./RoomContext";

function Hint({ children }: { children: ReactNode }) {
  return <div className="hint">{children}</div>;
}

function Composer() {
  const { g, act } = useGame();
  const [text, setText] = useState("");
  const thinking = !!g.turn?.thinking;
  const send = () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    act({ type: "say", text: v });
    stickBottom(true);
  };
  return (
    <>
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={200}
          placeholder="손님에게 할 말"
          name="line"
          aria-label="손님에게 할 말"
          disabled={thinking}
        />
        <button type="submit" className="btn solid icon" aria-label="보내기" disabled={thinking}>
          <ArrowUp aria-hidden />
        </button>
      </form>
      <Hint>
        <span>
          {thinking ? (
            <>
              손님이 생각하는 중 · 시계 멈춤 · <Elapsed note={false} />
            </>
          ) : (
            "Enter로 보내기 · 생각하는 동안 시계 멈춤"
          )}
        </span>
        <button type="button" className="btn ghost" onClick={() => act({ type: "endTurn" })}>
          그만하기
        </button>
      </Hint>
    </>
  );
}

/** 지금 상황에서 내가 할 수 있는 일 하나만 화면 아래에 둔다. */
function DockBody({ idea, setIdea }: { idea: string; setIdea: (v: string) => void }) {
  const { g, me, isHost, nameOf, act } = useGame();
  const t = g.turn;
  const cur = g.order[g.turnIdx];
  const hostName = nameOf(g.hostId);

  if (t?.status === "live" && t.player === me) return <Composer />;
  if (t?.status === "live") {
    return (
      <>
        <div className="reacts">
          <span>{nameOf(t.player)}님 응대 구경 중</span>
          {REACTS.map((e) => (
            <button key={e} type="button" className="btn" aria-label={`리액션 ${e}`} onClick={() => act({ type: "react", e })}>
              {e}
            </button>
          ))}
        </div>
        {isHost && (
          <Hint>
            <span>진행이 멈췄다면</span>
            <button type="button" className="btn ghost" onClick={() => act({ type: "endTurn" })}>
              이 차례 끝내기
            </button>
          </Hint>
        )}
      </>
    );
  }
  if (g.phase === "playing" && cur === me) {
    return (
      <button type="button" className="btn solid lg block" onClick={() => act({ type: "start" })}>
        내 차례 · 응대 시작 (2분)
      </button>
    );
  }
  if (g.phase === "playing" && cur) {
    return (
      <Hint>
        <span>{nameOf(cur)}님이 응대를 시작하길 기다리는 중</span>
        {isHost && (
          <button type="button" className="btn ghost" onClick={() => act({ type: "skip" })}>
            건너뛰기
          </button>
        )}
      </Hint>
    );
  }
  if (g.phase === "playing") {
    return isHost ? (
      <button type="button" className="btn solid lg block" onClick={() => act({ type: "review" })}>
        손님 리뷰 보기
      </button>
    ) : (
      <Hint>
        <span>진행자 {hostName}님이 리뷰를 열면 결과가 나와요.</span>
      </Hint>
    );
  }
  if (g.phase === "reviewing") {
    return (
      <Hint>
        <span>
          손님이 별점을 고르는 중이에요 · <Elapsed note={false} />
        </span>
        {isHost && (
          <button type="button" className="btn ghost" onClick={() => act({ type: "review" })}>
            너무 오래 걸리면 다시 시도
          </button>
        )}
      </Hint>
    );
  }
  if (g.phase === "review") {
    return isHost ? (
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          act({ type: "newCustomer", idea });
        }}
      >
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={60}
          placeholder="다음 손님 장소 (비우면 랜덤)"
          name="idea"
          aria-label="다음 손님 장소"
        />
        <button type="submit" className="btn solid">
          다음 손님
        </button>
      </form>
    ) : (
      <Hint>
        <span>진행자 {hostName}님이 다음 손님을 받으면 이어져요.</span>
      </Hint>
    );
  }
  return null;
}

export function Dock({ idea, setIdea }: { idea: string; setIdea: (v: string) => void }) {
  return (
    <div className="dock">
      <div className="panel">
        <DockBody idea={idea} setIdea={setIdea} />
        <HostAway hint />
        <ErrorLine hint />
      </div>
    </div>
  );
}
