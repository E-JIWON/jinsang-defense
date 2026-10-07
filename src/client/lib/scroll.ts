export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;

/** 대화를 읽으며 위로 올려 둔 사람은 끌어내리지 않는다. force는 내가 보낸 직후처럼 꼭 내려야 할 때. */
export function stickBottom(force = false) {
  if (!force && !nearBottom()) return;
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" }));
}
