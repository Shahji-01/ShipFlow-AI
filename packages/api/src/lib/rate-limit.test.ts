import { describe, it, expect } from "vitest";
import { rateLimit, getClientIp } from "./rate-limit";

describe("rateLimit (in-memory sliding window)", () => {
  it("allows requests up to the limit then blocks", () => {
    const key = `test:${Math.random()}`;
    const r1 = rateLimit(key, 3, 1000);
    const r2 = rateLimit(key, 3, 1000);
    const r3 = rateLimit(key, 3, 1000);
    const r4 = rateLimit(key, 3, 1000);

    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("resets after the window elapses", async () => {
    const key = `test:${Math.random()}`;
    rateLimit(key, 1, 50);
    expect(rateLimit(key, 1, 50).success).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rateLimit(key, 1, 50).success).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 1000).success).toBe(true);
    expect(rateLimit(a, 1, 1000).success).toBe(false);
    // Different key is unaffected.
    expect(rateLimit(b, 1, 1000).success).toBe(true);
  });
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(getClientIp(headers)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no ip headers are present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
