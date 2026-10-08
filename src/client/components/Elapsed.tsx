import { useEffect, useState } from "react";

/** 이 컴포넌트가 화면에 나타난 뒤 지난 초. 기다리는 자리마다 붙여서 얼마나 기다렸는지 보여 준다. */
export function useElapsed(): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return sec;
}

// 보통은 2~5초, Gemini가 막혀 내 PC(예비)로 넘어가면 10초 안팎. 그보다 길면 뭔가 걸린 것이다.
const SLOW_SEC = 12;
const STUCK_SEC = 25;

/**
 * "7초째"처럼 경과 시간을 보여 준다. 오래 걸리면 색이 바뀌고 한마디 덧붙인다.
 * 기다림이 시작될 때 마운트되도록 부모에서 key나 조건부 렌더로 묶는다.
 */
export function Elapsed({ note = true }: { note?: boolean }) {
  const sec = useElapsed();
  const cls = sec >= STUCK_SEC ? "elapsed stuck" : sec >= SLOW_SEC ? "elapsed slow" : "elapsed";
  return (
    <span className={cls} aria-live="polite">
      {sec}초째{note && sec >= STUCK_SEC ? " · 많이 느리네요" : note && sec >= SLOW_SEC ? " · 예비 AI로 넘어가는 중일 수 있어요" : ""}
    </span>
  );
}
