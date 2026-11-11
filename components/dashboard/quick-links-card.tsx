import { ArrowUpRight, Clapperboard, ListTodo, Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";

export function QuickLinksCard() {
  return (
    <Card className="quick-links-card">
      <header className="quick-links-heading">
        <h2>快捷入口</h2>
        <p>常用工具，从这里出发</p>
      </header>
      <div className="quick-links-grid">
        <a className="quick-entry" href="https://personal-daily-qq.pages.dev/">
          <Newspaper size={23} aria-hidden />
          <strong>每日简报</strong>
          <span>打开今日简报 <ArrowUpRight size={15} aria-hidden /></span>
        </a>
        <button className="quick-entry" type="button" disabled>
          <Clapperboard size={23} aria-hidden />
          <strong>自媒体工作台</strong>
          <span>敬请期待</span>
        </button>
        <a className="quick-entry" href="/todo">
          <ListTodo size={23} aria-hidden />
          <strong>TO DO</strong>
          <span>打开 AI 日程 <ArrowUpRight size={15} aria-hidden /></span>
        </a>
      </div>
    </Card>
  );
}
