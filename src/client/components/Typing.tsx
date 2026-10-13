import { Elapsed } from "./Elapsed";
import { Face } from "./Face";

/** 손님이 생각 중일 때 말풍선 자리. elapsed면 옆에 몇 초째 기다리는지 보여 준다. */
export function Typing({ anger, elapsed = false }: { anger?: number; elapsed?: boolean }) {
  return (
    <div className="mc">
      {anger == null ? <div className="face sm skelbox" /> : <Face anger={anger} small />}
      <div className="bubble typing">
        <span />
        <span />
        <span />
      </div>
      {elapsed && <Elapsed />}
    </div>
  );
}
