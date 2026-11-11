import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={clsx("card", className)}>{children}</section>;
}

export function CardHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="card-header">
      <div className="card-heading">
        <Icon aria-hidden size={20} strokeWidth={1.8} />
        <h2>{title}</h2>
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

