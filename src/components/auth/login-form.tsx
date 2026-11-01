"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { DATA_MODE } from "@/lib/data/backoffice-provider";

/** Only allow returning to a path on this site (never an external URL). */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/payroll";
  return value;
}

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (DATA_MODE !== "live") {
    return (
      <Card className="p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Sample-data preview</h1>
        <p className="mt-2 text-sm text-slate-600">This preview has no sign-in. Sign-in is used on the hosted app.</p>
        <Link href="/payroll" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white">
          Open the preview
        </Link>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        // Full navigation so the new session cookie applies to everything.
        window.location.assign(basePath + next);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Couldn't sign in. Try again.");
      setPassword("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <Field label="Username" htmlFor="login-username">
          <Input
            id="login-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!error}
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600"
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
            >
              {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </Field>
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          <LogIn className="size-4" aria-hidden />
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
