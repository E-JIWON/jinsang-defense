import { ChevronDown } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { type Customer, goalOf, remaining, staffOf, TURN_MS, type Turn } from "../../../shared/game";
import { Face } from "../../components/Face";
import { formatClock, moodColor } from "../../lib/format";
import { CustomerDetails } from "./CustomerInfo";

/** 1초보다 촘촘히 갱신해야 0:00 근처에서 숫자가 튀지 않는다. 이 컴포넌트만 다시 그린다. */
function Clock({ turn }: { turn: Turn | null }) {
  const live = turn?.status === "live";
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [live]);

  if (!live) return <span className="clock idle">{formatClock(TURN_MS)}</span>;
  const left = remaining(turn);
  return <span className={`clock${turn.thinking ? " paused" : left < 15_000 ? " low" : ""}`}>{formatClock(left)}</span>;
}

type Props = { c: Customer; anger: number; sub: string; turn: Turn | null };

/** 손님 얼굴·이름·시계·분노 막대. 폰에서는 눌러서 상황을 펼친다(PC는 옆 패널에 늘 보임). */
export function CustomerBar({ c, anger, sub, turn }: Props) {
  const [open, setOpen] = useState(false);
  const face = useRef<HTMLDivElement>(null);
  const prev = useRef({ anger, player: turn?.player });

  // 한 번에 크게 화나면 얼굴을 흔든다.
  useEffect(() => {
    const p = prev.current;
    prev.current = { anger, player: turn?.player };
    const el = face.current;
    if (!el || p.player !== turn?.player || anger <= p.anger + 9) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }, [anger, turn?.player]);

  return (
    <div className={open ? "custbar open" : "custbar"}>
      <button type="button" className="cb-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Face ref={face} anger={anger} />
        <div className="cb-main">
          <div className="row nowrap">
            <span className="label cust">손님</span>
            <span className="cb-name">{c.name}</span>
          </div>
          <div className="meter" style={{ "--mood": moodColor(anger) } as CSSProperties} title={`분노 ${anger}`}>
            <i style={{ width: `${anger}%` }} />
          </div>
          <span className="cb-sub">
            분노 {anger} · {sub}
          </span>
        </div>
        <Clock turn={turn} />
        <span className="chev">
          <ChevronDown aria-hidden />
        </span>
      </button>
      {/* 내 역할은 대화하는 내내 눈앞에 있어야 해서 접어도, PC에서도 늘 보인다. */}
      <div className="role-mini">
        <span className="label">내 역할</span>
        <span>
          <b>{staffOf(c)}</b> · {goalOf(c)}
        </span>
      </div>
      {open && (
        <div className="cb-more">
          <CustomerDetails c={c} />
        </div>
      )}
    </div>
  );
}
