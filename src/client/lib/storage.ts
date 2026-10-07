// 사파리 사생활 보호 모드 등에서는 localStorage 접근 자체가 throw 한다.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

export const NICK_KEY = "jinsang-nick";
const TOKEN_KEY = "jinsang-token";

/** 이 브라우저에만 있는 비밀 토큰. 서버는 이 토큰의 해시를 공개 id로 쓴다. */
export function loadToken(): string {
  const saved = storage.get(TOKEN_KEY);
  if (saved) return saved;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  storage.set(TOKEN_KEY, token);
  return token;
}
