export const todoDashboardPath = "/todo/dashboard";
export const todoTasksPath = todoDashboardPath + "?view=tasks";
const mobileTodoDestinations = new Set(["/todo", "/todo?tab=chat", "/todo/settings", "/todo/widget"]);
const destinations = new Set([
  "/", "/history", "/projects", "/settings",
  todoDashboardPath, todoTasksPath, ...mobileTodoDestinations,
]);

export function isMobileTodoDestination(destination: string) {
  return mobileTodoDestinations.has(destination);
}

// Return only known same-site views, even when the URL came from a bookmark.
export function loginDestination(value: unknown): string {
  if (value === "/dashboard?view=tasks") return todoTasksPath;
  if (typeof value === "string" && (destinations.has(value) || /^\/projects\/changes\/[1-9]\d*$/.test(value))) {
    return value;
  }
  return todoDashboardPath;
}

export function loginUrl(destination: string, step: "phone" | "password" | "register" = "phone") {
  const params = new URLSearchParams();
  const target = loginDestination(destination);
  if (target !== todoDashboardPath) params.set("next", target);
  if (step !== "phone") params.set("step", step);
  return params.size ? "/login?" + params.toString() : "/login";
}
