import type { CSSProperties } from "react";

// bongchil 디자인 시스템 comment-*-solid
const COLORS = ["#4a7c59", "#50aac8", "#c8a050", "#c86e82", "#b47850", "#64be8c", "#5a544e"];

function colorOf(id: string) {
  let x = 0;
  for (const c of id) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[x % COLORS.length];
}

export function Avatar({ id, nick, size }: { id: string; nick?: string; size?: "sm" | "lg" }) {
  return (
    <span className={size ? `av ${size}` : "av"} style={{ "--c": colorOf(id) } as CSSProperties} aria-hidden>
      {[...(nick || "?")][0]}
    </span>
  );
}
