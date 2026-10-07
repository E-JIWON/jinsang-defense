import type { Customer } from "../../../shared/game";

/** 상황과 손님 요구가 응대의 핵심이라 먼저, 크게. 장소·특징 칩은 보조로 아래에 둔다. */
export function CustomerDetails({ c }: { c: Customer }) {
  return (
    <>
      <p className="situation">{c.situation}</p>
      {c.want && (
        <div className="want">
          <span className="label cust">손님 요구</span>
          <span>{c.want}</span>
        </div>
      )}
      <div className="tags">
        {c.place && <span className="tag">{c.place}</span>}
        {c.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
    </>
  );
}
