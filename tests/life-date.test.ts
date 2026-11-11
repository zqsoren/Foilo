import { describe, expect, it } from "vitest";
import {
  epochToLocalInput,
  formatDuration,
  formatRemainingDuration,
  getLifeDate,
  lifeDayBounds,
  localInputToEpoch,
  displayDate,
  weekBounds,
} from "../lib/life-date";

describe("凌晨 4 点生活日", () => {
  it("04:00 前归属上一生活日，04:00 起归属当天", () => {
    expect(getLifeDate(Date.parse("2026-08-20T19:20:00Z"))).toBe("2026-08-20");
    expect(getLifeDate(Date.parse("2026-08-20T20:00:00Z"))).toBe("2026-08-21");
    expect(getLifeDate(Date.parse("2026-08-21T18:30:00Z"))).toBe("2026-08-21");
    expect(getLifeDate(Date.parse("2026-08-21T20:00:00Z"))).toBe("2026-08-22");
  });

  it("边界是连续 24 小时", () => {
    const bounds = lifeDayBounds("2026-08-21");
    expect(bounds.start).toBe(Date.parse("2026-08-20T20:00:00Z"));
    expect(bounds.end).toBe(Date.parse("2026-08-21T20:00:00Z"));
  });

  it("本地输入和时间戳可以往返", () => {
    const input = "2026-08-21T18:42";
    expect(epochToLocalInput(localInputToEpoch(input))).toBe(input);
  });
});

describe("显示辅助", () => {
  it("以小时和分钟显示时长", () => {
    expect(formatDuration(42)).toBe("0m");
    expect(formatDuration(3_900)).toBe("1h05m");
    expect(formatRemainingDuration(19_799)).toBe("5h30m");
  });

  it("一周从周一开始", () => {
    expect(weekBounds("2026-08-21")).toEqual({
      start: "2026-08-17",
      end: "2026-08-24",
    });
  });

  it("完整日期带中文年月日", () => {
    expect(displayDate("2026-08-21").full).toBe("2026年8月21日");
  });
});
