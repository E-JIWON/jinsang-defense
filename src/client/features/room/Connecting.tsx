/** 방 상태가 오기 전: 대기실과 같은 틀에 뼈대만 그려서, 상태가 도착해도 레이아웃이 튀지 않게 한다. */
export function Connecting({ connected }: { connected: boolean }) {
  return (
    <div className="shell" aria-busy>
      <section className="chatcol lobbycol">
        <div className="card lobby">
          <div className="stack tight">
            <span className="skel-line" style={{ width: 48 }} />
            <h2 className="lobby-title">{connected ? "가게 문 여는 중…" : "가게에 연결하는 중…"}</h2>
            <span className="skel-line" style={{ width: "70%" }} />
          </div>
          <div className="invitebox skel-block" style={{ height: 124 }} />
          <div className="skel-block" style={{ height: 52 }} />
          <span className="skel-line" style={{ width: 120, margin: "6px 0" }} />
        </div>
      </section>
      <aside className="side">
        <div className="card tight">
          <span className="skel-line" style={{ width: 64 }} />
          <div className="skel-block" style={{ height: 50 }} />
        </div>
      </aside>
    </div>
  );
}
