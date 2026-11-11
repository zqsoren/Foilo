// DIGTODO · Scriptable v4 · 白底鲜橙
// 在 Scriptable 新建脚本，粘贴全部内容，命名「今日计划」后运行。
// 首次运行粘贴网页连接码。圆圈打开任务操作：完成、推迟、取消。
const SITE = "https://life-152-32-131-4.nip.io";
const KEY = "xipo-today-widget-v1";

async function loadToday(token) {
  const request = new Request(SITE + "/api/todo/widget");
  request.headers = { Authorization: "Bearer " + token, Accept: "application/json" };
  request.timeoutInterval = 15;
  request.onRedirect = () => null;
  const body = await request.loadString();
  if (request.response.statusCode === 401) throw new Error("连接码已失效，请打开 Scriptable 重新连接。");
  if (request.response.statusCode !== 200) throw new Error("暂时无法连接，稍后再试。");
  const data = JSON.parse(body);
  if (!Array.isArray(data.events) || !data.date || !data.clock) throw new Error("日程暂时不可用。");
  return data;
}

async function connect() {
  const alert = new Alert();
  alert.title = "连接你的日程";
  alert.message = "从日程 → 小组件页面复制连接码，粘贴在这里。无需账号密码。";
  alert.addSecureTextField("xipo_ 开头的连接码");
  alert.addAction("连接");
  alert.addCancelAction("取消");
  if (await alert.presentAlert() === -1) return null;
  const token = alert.textFieldValue(0).trim();
  const data = await loadToday(token);
  Keychain.set(KEY, token);
  return data;
}

function text(parent, content, size, color, bold) {
  const label = parent.addText(content);
  label.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  label.textColor = new Color(color);
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.85;
  return label;
}

function makeWidget(data, error, family) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("FFFFFF");
  widget.setPadding(13, 14, 12, 14);
  widget.url = SITE + (!data ? "/todo/widget" : "/todo");
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const small = family === "small";
  if (!data) {
    widget.setPadding(16, 16, 16, 16);
    const message = text(widget, error || "先在 Scriptable 运行脚本，连接你的日程。", 12, "715A4B", false);
    message.lineLimit = 4;
    widget.addSpacer();
    text(widget, "点击查看连接方法", 10, "C36B3F", false);
    return widget;
  }
  const split = widget.addStack();
  split.layoutHorizontally();
  const side = split.addStack();
  side.layoutVertically();
  side.size = new Size(small ? 42 : 76, 0);
  side.setPadding(0, 0, 0, 10);
  const centered = (content, size, bold) => {
    const row = side.addStack(); text(row, content, size, "F37427", bold);
  };
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(data.date + "T00:00:00Z").getUTCDay()];
  centered(Number(data.date.slice(5, 7)) + "月" + Number(data.date.slice(8)) + "日", small ? 9 : 11, false);
  centered(weekday, small ? 8 : 10, false);
  side.addSpacer();
  centered(String(data.pending == null ? data.events.filter(e => !e.completed && (!e.status || e.status === "pending")).length : data.pending), small ? 32 : 48, true);
  side.addSpacer(3);
  centered(data.completed + "/" + data.total, small ? 10 : 12, false);
  const content = split.addStack();
  content.layoutVertically();
  content.setPadding(0, small ? 5 : 10, 0, 0);
  const limit = small ? 2 : family === "large" ? 7 : 3;
  const events = data.events.slice(0, limit);
  if (!events.length) {
    content.addSpacer();
    const empty = text(content, "今天还没有日程", small ? 11 : 13, "443A34", true);
    empty.lineLimit = 2;
    content.addSpacer(5);
    text(content, "点击安排今天", 10, "867B74", false);
  }
  for (const event of events) {
    const row = content.addStack();
    row.centerAlignContent();
    const status = event.completed ? "completed" : event.status || "pending";
    const circle = row.addStack();
    const symbol = SFSymbol.named(status === "completed" ? "checkmark.circle.fill" : status === "cancelled" ? "minus.circle" : status === "deferred" ? "chevron.right.circle" : "circle");
    const image = circle.addImage(symbol.image); image.imageSize = new Size(17, 17); image.tintColor = new Color(status === "pending" ? "F37427" : "B3B3B8");
    if (!small && event.id) circle.url = actionURL(event);
    row.addSpacer(8);
    const column = row.addStack();
    column.layoutVertically();
    text(column, event.title, small ? 11 : 13, status !== "pending" ? "B3B3B8" : "2D2D31", status === "pending");
    column.addSpacer(2);
    text(column, event.start ? event.start + "–" + event.end : "时间待定", small ? 9 : 10, "77797F", false);
    content.addSpacer(family === "large" ? 13 : 8);
  }
  content.addSpacer();
  const remaining = data.total - events.length;
  if (remaining > 0) text(content, "另 " + remaining + " 项", 9, "867B74", false);
  text(content, data.clock + " 更新", small ? 8 : 9, "77797F", false);
  if (small) widget.url = actionURL();
  return widget;
}

function actionURL(event) {
  return "scriptable:///run?scriptName=" + encodeURIComponent(Script.name()) + "&action=task" + (event ? "&id=" + encodeURIComponent(event.id) + "&date=" + encodeURIComponent(event.date) : "");
}
async function taskAction(token) {
  let data = await loadToday(token);
  let event = data.events.find(e => e.id === args.queryParameters.id && e.date === args.queryParameters.date);
  if (!event) {
    if (args.queryParameters.id) throw new Error("任务日期已变化，请刷新后再操作。");
    const picker = new Alert(); picker.title = "选择任务";
    data.events.forEach(e => picker.addAction(e.title)); picker.addCancelAction("返回");
    const index = await picker.presentSheet(); if (index < 0) return data;
    event = data.events[index];
  }
  const menu = new Alert(); menu.title = event.title;
  menu.addAction(event.status === "deferred" ? "已推迟（请选取消推迟）" : event.completed ? "恢复待办" : "完成"); menu.addAction(event.status === "deferred" ? "取消推迟，恢复今日" : "推迟到明天"); menu.addAction(event.status === "cancelled" ? "恢复待办" : "取消任务"); menu.addCancelAction("返回");
  const index = await menu.presentSheet(); if (index < 0) return data;
  const status = index === 0 ? event.status === "deferred" ? "deferred" : event.completed ? "pending" : "completed" : index === 1 ? event.status === "deferred" ? "pending" : "deferred" : event.status === "cancelled" ? "pending" : "cancelled";
  const request = new Request(SITE + "/api/todo/widget");
  request.method = "POST"; request.headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" }; request.timeoutInterval = 20; request.onRedirect = () => null;
  request.body = JSON.stringify({ id: event.id, occurrenceDate: event.occurrenceDate, date: event.date, status, revision: data.revision, requestId: UUID.string() });
  const body = JSON.parse(await request.loadString());
  if (request.response.statusCode !== 200) throw new Error(body.error || "未能保存，请刷新后重试");
  return body;
}

async function main() {
  let data = null, error = null;
  try {
    if (!config.runsInWidget && typeof args !== "undefined" && args.queryParameters.action === "task" && Keychain.contains(KEY)) {
      data = await taskAction(Keychain.get(KEY));
    } else if (config.runsInWidget) {
      if (Keychain.contains(KEY)) data = await loadToday(Keychain.get(KEY));
    } else if (!Keychain.contains(KEY)) {
      data = await connect();
    } else {
      const menu = new Alert();
      menu.title = "今日计划";
      menu.addAction("刷新并预览");
      menu.addAction("更换连接码");
      menu.addCancelAction("取消");
      const action = await menu.presentSheet();
      if (action === -1) { Script.complete(); return; }
      data = action === 1 ? await connect() : await loadToday(Keychain.get(KEY));
    }
  } catch (e) {
    error = e.message && /[\u4e00-\u9fff]/.test(e.message) ? e.message : "暂时无法连接，请检查网络后重试。";
  }
  // Do not cache private tasks. A failed refresh shows a recovery message.
  const widget = makeWidget(data, error, config.widgetFamily || "medium");
  Script.setWidget(widget);
  if (!config.runsInWidget) await widget.presentMedium();
  Script.complete();
}
await main();
