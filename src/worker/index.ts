import { ROOM_CODE } from "../shared/protocol";
import { clientIp, HOUR, limiter } from "./limiter";
import { LIMITS } from "./room";

export { Limiter } from "./limiter";
export { Room } from "./room";

// 헷갈리는 글자(0/O, 1/I/L)는 뺐다.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export default {
  async fetch(req, env): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === "/api/room" && req.method === "POST") {
      if (!(await limiter(env, `rooms:${clientIp(req)}`).take(LIMITS.rooms, HOUR))) {
        return Response.json({ error: "가게를 너무 많이 열었어요. 잠시 뒤 다시 해 주세요." }, { status: 429 });
      }
      const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
      return Response.json({ code });
    }

    const code = pathname.match(/^\/ws\/(.+)$/)?.[1];
    if (code && ROOM_CODE.test(code)) return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
