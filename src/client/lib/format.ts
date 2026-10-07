/** 분노 0→50→100을 초록→모래→장미색으로 잇는다. */
export const moodColor = (anger: number) =>
  anger <= 50 ? `color-mix(in oklab, #5a8268 ${100 - anger * 2}%, #c8a050)` : `color-mix(in oklab, #c8a050 ${200 - anger * 2}%, #c2607a)`;

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const roomUrl = (code: string) => `${location.origin}/r/${code}`;
