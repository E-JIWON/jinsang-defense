/** 비밀 토큰 → 공개 id. 공개 id만 알아서는 그 사람을 흉내 낼 수 없다. */
export async function publicId(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jinsang:${token}`));
  return [...new Uint8Array(d)]
    .slice(0, 9)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
