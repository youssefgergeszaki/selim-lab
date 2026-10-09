"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword, type AuthState } from "@/server/actions/auth";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { localizePath } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/form";

function messageFor(state: AuthState, dict: Dictionary): { tone: "danger" | "success"; text: string } | null {
  if (state.status === "idle" || !state.message) return null;
  const map: Record<NonNullable<AuthState["message"]>, string> = {
    invalid_credentials: dict.auth.invalidCredentials,
    email_not_confirmed: dict.auth.emailNotConfirmed,
    validation: dict.checkout.errors.validation,
    password_mismatch: dict.auth.passwordMismatch,
    rate_limited: dict.common.tooManyRequests,
    unavailable: dict.auth.authUnavailable,
    check_email: dict.auth.checkEmail,
    reset_sent: dict.auth.resetSent,
    password_updated: dict.auth.passwordUpdated,
    link_invalid: dict.auth.linkInvalid,
    generic: dict.common.genericError,
  };
  return { tone: state.status === "success" ? "success" : "danger", text: map[state.message] };
}

function invalid(state: AuthState, field: string) {
  return state.fields?.includes(field) ? true : undefined;
}

export function SignInForm({ locale, dict, next }: { locale: Locale; dict: Dictionary; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, { status: "idle" });
  const message = messageFor(state, dict);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Field id="email" label={dict.auth.email}>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required aria-invalid={invalid(state, "email")} className="text-start" />
      </Field>
      <Field id="password" label={dict.auth.password}>
        <Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required aria-invalid={invalid(state, "password")} className="text-start" />
      </Field>
      <div className="flex justify-end">
        <Link href={localizePath(locale, "/account/forgot-password")} className="link-underline text-sm">
          {dict.auth.forgotLink}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? dict.auth.signingIn : dict.auth.signIn}
      </Button>
    </form>
  );
}

export function SignUpForm({ locale, dict, next }: { locale: Locale; dict: Dictionary; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, { status: "idle" });
  const message = messageFor(state, dict);
  if (state.status === "success") return <Alert tone="success">{message?.text}</Alert>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Field id="fullName" label={dict.auth.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required maxLength={120} aria-invalid={invalid(state, "fullName")} />
      </Field>
      <Field id="email" label={dict.auth.email}>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required aria-invalid={invalid(state, "email")} className="text-start" />
      </Field>
      <Field id="password" label={dict.auth.password} hint={dict.auth.passwordRules}>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={invalid(state, "password")}
          aria-describedby="password-hint"
          className="text-start"
        />
      </Field>
      <Field id="confirm" label={dict.auth.confirmPassword}>
        <Input id="confirm" name="confirm" type="password" dir="ltr" autoComplete="new-password" required aria-invalid={invalid(state, "confirm")} className="text-start" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? dict.auth.registering : dict.auth.register}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, { status: "idle" });
  const message = messageFor(state, dict);
  if (state.status === "success") return <Alert tone="success">{message?.text}</Alert>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Field id="email" label={dict.auth.email}>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required aria-invalid={invalid(state, "email")} className="text-start" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {dict.auth.sendReset}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, { status: "idle" });
  const message = messageFor(state, dict);
  if (state.status === "success") {
    return (
      <div className="space-y-6">
        <Alert tone="success">{message?.text}</Alert>
        <Button asChild className="w-full">
          <Link href={localizePath(locale, "/account")}>{dict.account.title}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Field id="password" label={dict.auth.newPassword} hint={dict.auth.passwordRules}>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={invalid(state, "password")}
          aria-describedby="password-hint"
          className="text-start"
        />
      </Field>
      <Field id="confirm" label={dict.auth.confirmPassword}>
        <Input id="confirm" name="confirm" type="password" dir="ltr" autoComplete="new-password" required aria-invalid={invalid(state, "confirm")} className="text-start" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {dict.auth.updatePassword}
      </Button>
    </form>
  );
}
