import type { Metadata } from "next";

export const todoWebAppMetadata = {
  applicationName: "在侧TODO",
  manifest: "/todo.webmanifest",
  appleWebApp: { capable: true, title: "在侧TODO", statusBarStyle: "default" },
  icons: { icon: "/todo-icons/icon-192.png?v=orange-todo", apple: [{ url: "/todo-icons/apple-touch-icon.png?v=orange-todo", sizes: "180x180", type: "image/png" }] },
} satisfies Metadata;
