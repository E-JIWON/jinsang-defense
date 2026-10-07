import { type Customer, goalOf, staffOf } from "../../../shared/game";

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

export function RoleLine({ c, divided }: { c: Customer; divided?: boolean }) {
  return (
    <div className={divided ? "role divided" : "role"}>
      <span className="label">내 역할</span>
      <span>
        <b>{staffOf(c)}</b> · {goalOf(c)}
      </span>
    </div>
  );
}
