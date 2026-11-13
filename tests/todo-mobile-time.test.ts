import { describe, expect, it } from "vitest";
import { initialSlot, dragInterval } from "../lib/todo/mobile-time";
import type { TodoEvent } from "../lib/todo/model";

const date = "2026-11-13";
const now = { date, clock: "11:46" };
const task = (end: string, status: TodoEvent["status"] = "pending") => ({
  id: "example", title: "前一项", date, start: "10:00", end, notes: "", completed: false, fixed: false, status
});
describe("手机日程默认时段", () => {
  it("无前项时向上取整十分钟，有前项时使用最晚结束时间加十分钟", () => {
    expect(initialSlot(date, [], now)).toEqual({ date, start: "11:50", end: "12:50" });
    expect(initialSlot(date,[task("11:30"),task("10:50"),task("16:00","cancelled")],now)).toEqual({date,start:"11:40",end:"12:40"});
    expect(initialSlot(date,[],{date,clock:"11:40"}).start).toBe("11:40");
  });
  it("一小时超出当天时转至次日完整时段", () => {
    expect(initialSlot(date,[task("23:55")],now)).toEqual({date:"2026-11-14",start:"00:05",end:"01:05"});
  });
});
describe("时间尺", () => {
  it("中段按分钟平移并保留当前时长", () => {
    expect(dragInterval(600,660,"range",1)).toEqual([601,661]);
    expect(dragInterval(600,660,"range",2)).toEqual([602,662]);
    expect(dragInterval(600,685,"range",60)).toEqual([660,745]);
  });
  it("两端独立变化，最短一分钟，不能超出当天", () => {
    expect(dragInterval(600,660,"start",2)).toEqual([602,660]);
    expect(dragInterval(600,660,"end",2)).toEqual([600,662]);
    expect(dragInterval(600,660,"end",-90)).toEqual([600,601]);
    expect(dragInterval(600,660,"range",1000)).toEqual([1379,1439]);
    expect(dragInterval(600,660,"range",-700)).toEqual([0,60]);
  });
});
