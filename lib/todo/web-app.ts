import type { Metadata } from "next";

export const todoWebAppMetadata = {
  manifest: "/todo.webmanifest",
  appleWebApp: { capable: true, title: "DIGTODO", statusBarStyle: "default" },
  icons: { apple: [{ url: "/todo-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
} satisfies Metadata;
