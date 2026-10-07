import { useRef } from "react";
import { roomUrl } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useRoomContext } from "./RoomContext";

/** 클립보드가 막힌 환경(http, 권한 거부)에서는 링크를 선택해 둬서 직접 복사하게 한다. */
export function copyInvite(code: string, fallback?: HTMLInputElement | null) {
  if (!navigator.clipboard) return fallback?.select();
  navigator.clipboard.writeText(roomUrl(code)).then(
    () => toast("초대 링크를 복사했어요"),
    () => fallback?.select(),
  );
}

export function InviteBox() {
  const { code } = useRoomContext();
  const input = useRef<HTMLInputElement>(null);
  if (!code) return null;
  return (
    <div className="invitebox">
      <div className="row spread">
        <span className="h3">친구 초대</span>
        <span className="code">{code}</span>
      </div>
      <div className="linkbox">
        <input ref={input} readOnly value={roomUrl(code)} onFocus={(e) => e.target.select()} name="invite" aria-label="초대 링크" />
        <button type="button" className="btn" onClick={() => copyInvite(code, input.current)}>
          링크 복사
        </button>
      </div>
      <p className="tiny">링크를 받은 친구는 닉네임만 쓰면 바로 직원으로 들어와요.</p>
    </div>
  );
}
