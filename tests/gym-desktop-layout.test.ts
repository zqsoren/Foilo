import { describe, expect, it } from "vitest";
import {
  boardDimensions,
  moveWidget,
  widgetSpan,
} from "../lib/gym/desktop-layout";
import { widgetKeys } from "../lib/gym/desktop";

describe("健身组件布局", () => {
  it("常规桌面保持三列并整体等比适配，较窄窗口减少列数", () => {
    expect(boardDimensions(1830)).toEqual({
      columns: 3,
      scale: 1,
      canvasWidth: 1830,
    });
    for (const width of [1790, 1378, 1170]) {
      expect(boardDimensions(width)).toEqual({
        columns: 3,
        scale: width / 1830,
        canvasWidth: 1830,
      });
    }
    expect(boardDimensions(1169).columns).toBe(2);
    expect(boardDimensions(740).columns).toBe(2);
    expect(boardDimensions(739).columns).toBe(1);
    expect(boardDimensions(2200).scale).toBe(1);
    expect(boardDimensions(1000)).toEqual({
      columns: 2,
      scale: 1000 / 1215,
      canvasWidth: 1215,
    });
    expect(boardDimensions(358)).toEqual({
      columns: 1,
      scale: 358 / 600,
      canvasWidth: 600,
    });
  });
  it("拖动重排保留所有类型和原始数组，能够移到首尾", () => {
    const initial = [...widgetKeys];
    const first = initial[0],
      last = initial[initial.length - 1];
    const moved = moveWidget(initial, first, last);
    expect(moved[moved.length - 1]).toBe(first);
    expect(moveWidget(moved, first, last)[moved.length - 2]).toBe(first);
    expect(new Set(moved)).toEqual(new Set(initial));
    expect(initial).toEqual(widgetKeys);
    expect(moveWidget(initial, last, first)[0]).toBe(last);
  });
  it("混合尺寸保留阶段组件两列及高组件的行跨度", () => {
    expect(widgetSpan("phase", 3)).toEqual({ columns: 2, rows: 1 });
    expect(widgetSpan("recent", 3)).toEqual({ columns: 1, rows: 3 });
    expect(widgetSpan("calendar", 2)).toEqual({ columns: 1, rows: 2 });
  });
});
