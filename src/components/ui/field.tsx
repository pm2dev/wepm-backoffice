import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 aria-invalid:border-red-600 disabled:bg-slate-100";
// text-base on phones prevents iOS Safari from zooming into focused inputs.

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error ? <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(control, "pr-8", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-20", className)} {...p} />;
});
