import { Face } from "./Face";

/** 손님이 생각 중일 때 말풍선 자리. */
export function Typing({ anger }: { anger?: number }) {
  return (
    <div className="mc">
      {anger == null ? <div className="face sm skelbox" /> : <Face anger={anger} small />}
      <div className="bubble typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
