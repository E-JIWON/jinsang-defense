import { Face } from "../../components/Face";

/** 첫 화면 오른쪽의 예시 대화. 실제 대화 화면과 같은 말풍선을 써서 뭘 하는 게임인지 바로 보이게. */
export function PreviewChat() {
  return (
    <div className="preview" aria-hidden>
      <div className="row nowrap" style={{ gap: 10 }}>
        <Face anger={62} />
        <div style={{ minWidth: 0 }}>
          <b style={{ display: "block", fontSize: 14 }}>영수증 없는 교환왕</b>
          <span className="tiny">휴대폰 매장 · 분노 62</span>
        </div>
      </div>
      <div className="mc">
        <Face anger={62} small />
        <div className="body">
          <div className="bubble">교환해 줘요. 영수증은 마음속에 있어요.</div>
        </div>
      </div>
      <div className="mp">
        <div className="bubble">마음속 영수증은 저희 시스템에서 조회가 안 돼요 ㅠㅠ</div>
        <div className="meta">
          <span className="chip good">+14 · 센스 만점</span>
        </div>
      </div>
      <div className="mc">
        <Face anger={48} small />
        <div className="body">
          <div className="bubble">요즘 시대에 마음도 조회가 안 돼요?</div>
          <div className="meta">
            <span className="thought">속마음 · 말빨 좀 되네</span>
          </div>
        </div>
      </div>
    </div>
  );
}
