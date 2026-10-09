"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AdminResult = { ok: true; message?: string; id?: string } | { ok: false; error: string; fields?: string[] };

/**
 * Submits a dashboard form to a Server Action without resetting the inputs on validation
 * errors, then refreshes server data. Authorization is enforced inside the action.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  messages,
  className,
  variant = "primary",
  size = "md",
  resetOnSuccess = false,
  redirectTo,
  confirmText,
  inline = false,
}: {
  action: (formData: FormData) => Promise<AdminResult>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  messages: Record<string, string>;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  resetOnSuccess?: boolean;
  /** Navigate after success; "{id}" is replaced by the id returned by the action. */
  redirectTo?: string;
  confirmText?: string;
  inline?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await action(formData);
      setResult(res);
      if (res.ok) {
        if (resetOnSuccess) formRef.current?.reset();
        if (redirectTo) router.push(redirectTo.replace("{id}", res.id ?? ""));
        router.refresh();
      }
    });
  }

  const message = result
    ? result.ok
      ? (result.message ?? messages.saved)
      : (messages[result.error] ?? messages.error)
    : null;
  const invalidFields = result && !result.ok ? (result.fields ?? []) : [];

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={cn(inline ? "inline-flex flex-wrap items-center gap-2" : "space-y-5", className)}
      data-invalid-fields={invalidFields.join(" ") || undefined}
    >
      {children}
      <div className={cn("flex flex-wrap items-center gap-3", inline && "contents")}>
        <Button type="submit" variant={variant} size={size} disabled={pending}>
          {pending ? (pendingLabel ?? submitLabel) : submitLabel}
        </Button>
        {message ? (
          <p role={result?.ok ? "status" : "alert"} className={cn("text-sm", result?.ok ? "text-success" : "text-danger")}>
            {message}
            {invalidFields.length > 0 ? <span className="ltr-nums text-xs opacity-75"> ({invalidFields.join(", ")})</span> : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
