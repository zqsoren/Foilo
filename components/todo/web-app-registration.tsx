"use client";

import { useEffect } from "react";

export function WebAppRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let registration: ServiceWorkerRegistration | undefined;
    const update = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };
    void navigator.serviceWorker.register("/todo-sw.js", { scope: "/", updateViaCache: "none" })
      .then((value) => { registration = value; })
      .catch(() => { /* The online app remains usable if registration is unavailable. */ });
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return null;
}
