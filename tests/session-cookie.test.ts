import { describe, expect, it } from "vitest";
import { sessionCookiePolicy } from "../lib/session-cookie";

describe("本机预览登录", () => {
  it("本机 HTTP 预览使用独立的 Cookie", () => {
    expect(sessionCookiePolicy(true, true, "127.0.0.1", "127.0.0.1:3190", "http"))
      .toEqual({ name: "life_session_local_preview", secure: false });
  });

  it.each([
    [false, "127.0.0.1", "127.0.0.1:3190", null],
    [true, "0.0.0.0", "localhost:3190", null],
    [true, "127.0.0.1", "life.example.com", "http"],
    [true, "127.0.0.1", "127.0.0.1:3190", "https"],
  ] as const)("线上或代理请求仍要求 HTTPS", (optIn, bind, host, proto) => {
    expect(sessionCookiePolicy(true, optIn, bind, host, proto))
      .toEqual({ name: "life_session", secure: true });
  });
});
