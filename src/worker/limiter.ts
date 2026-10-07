import { DurableObject } from "cloudflare:workers";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** 키마다(IP·방·전체) 하나씩 뜨는 고정 창 카운터. */
export class Limiter extends DurableObject<Env> {
  async take(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    let w = (await this.ctx.storage.get<{ start: number; n: number }>("w")) ?? { start: now, n: 0 };
    if (now - w.start > windowMs) w = { start: now, n: 0 };
    if (w.n >= limit) return false;
    w.n++;
    await this.ctx.storage.put("w", w);
    return true;
  }
}

export const limiter = (env: Env, key: string) => env.LIMITER.get(env.LIMITER.idFromName(key));

export const clientIp = (req: Request) => req.headers.get("CF-Connecting-IP") || "local";
