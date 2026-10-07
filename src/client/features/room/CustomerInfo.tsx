import type { Customer } from "../../../shared/game";

export function CustomerDetails({ c }: { c: Customer }) {
  return (
    <>
      <div className="tags">
        {c.place && <span className="tag">{c.place}</span>}
        {c.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
      <p>{c.situation}</p>
      {c.want && <p className="sub">원하는 것 · {c.want}</p>}
    </>
  );
}
