import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Life · 人生工作台",
  description: "一个以今天为核心的个人生活操作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

