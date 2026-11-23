import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, badge, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="truncate text-2xl font-black tracking-tight text-foreground sm:text-[1.75rem]">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}