import { widgets, type Widget } from "./desktop";

export function boardDimensions(width: number) {
  const columns = width >= 1830 ? 3 : width >= 1215 ? 2 : 1;
  const canvasWidth = columns * 600 + (columns - 1) * 15;
  return { columns, scale: Math.min(1, width / canvasWidth), canvasWidth };
}

export function moveWidget(layout: Widget[], active: Widget, over: Widget) {
  const from = layout.indexOf(active),
    to = layout.indexOf(over);
  if (from < 0 || to < 0 || from === to) return layout;
  const next = [...layout];
  next.splice(from, 1);
  next.splice(to, 0, active);
  return next;
}

export function widgetSpan(kind: Widget, columns: number) {
  const [, width, height] = widgets[kind];
  return {
    columns: width > 600 && columns > 1 ? 2 : 1,
    rows: columns === 1 && width > 600 ? 1 : (height + 20) / 220,
  };
}
