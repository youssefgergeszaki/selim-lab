"use client";

import { useActionState } from "react";
import { submitReview, type ReviewState } from "@/server/actions/reviews";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export function ReviewForm({
  productId,
  locale,
  labels,
}: {
  productId: string;
  locale: Locale;
  labels: {
    title: string;
    rating: string;
    reviewTitle: string;
    body: string;
    submit: string;
    pending: string;
    signIn: string;
    invalid: string;
    duplicate: string;
    error: string;
    tooMany: string;
    optional: string;
  };
}) {
  const [state, action, busy] = useActionState<ReviewState, FormData>(submitReview, { status: "idle" });
  if (state.status === "submitted") {
    return (
      <p role="status" className="text-success">
        {labels.pending}
      </p>
    );
  }
  const error =
    state.status === "invalid"
      ? labels.invalid
      : state.status === "duplicate"
        ? labels.duplicate
        : state.status === "signin"
          ? labels.signIn
          : state.status === "rate_limited"
            ? labels.tooMany
            : state.status === "error"
              ? labels.error
              : null;
  return (
    <form action={action} className="max-w-xl space-y-5">
      <h3 className="font-display text-2xl">{labels.title}</h3>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="locale" value={locale} />
      <Field id="review-rating" label={labels.rating}>
        <Select id="review-rating" name="rating" defaultValue="5" required>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)} ({n})
            </option>
          ))}
        </Select>
      </Field>
      <Field id="review-title" label={labels.reviewTitle} optionalLabel={labels.optional}>
        <Input id="review-title" name="title" maxLength={120} />
      </Field>
      <Field id="review-body" label={labels.body}>
        <Textarea id="review-body" name="body" required minLength={3} maxLength={2000} rows={4} />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={busy}>
        {labels.submit}
      </Button>
    </form>
  );
}
