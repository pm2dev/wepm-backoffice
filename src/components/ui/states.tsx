import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-16 text-slate-600 justify-center">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Card className="border-red-200 bg-red-50 p-5" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="size-5 shrink-0 text-red-700" aria-hidden />
        <div className="space-y-3">
          <p className="text-sm text-red-900">{message}</p>
          {action}
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="p-8 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      {children ? <div className="mt-1 text-sm text-slate-600">{children}</div> : null}
    </Card>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
