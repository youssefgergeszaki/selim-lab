"use client";

import { useActionState } from "react";
import { addAddress, updateProfile, type AccountState } from "@/server/actions/account";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { governorates } from "@/lib/governorates";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";

export function ProfileForm({
  dict,
  profile,
}: {
  dict: Dictionary;
  profile: { fullName: string; phone: string; preferredLocale: Locale; marketingOptIn: boolean; email: string };
}) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateProfile, { status: "idle" });
  const bad = (f: string) => (state.fields?.includes(f) ? true : undefined);
  return (
    <form action={action} className="max-w-lg space-y-5">
      {state.status === "saved" ? <Alert tone="success">{dict.account.profileSaved}</Alert> : null}
      {state.status === "error" ? <Alert tone="danger">{dict.checkout.errors.validation}</Alert> : null}
      <Field id="email" label={dict.auth.email}>
        <Input id="email" value={profile.email} readOnly disabled dir="ltr" className="text-start" />
      </Field>
      <Field id="fullName" label={dict.account.fullName}>
        <Input id="fullName" name="fullName" defaultValue={profile.fullName} required maxLength={120} aria-invalid={bad("fullName")} />
      </Field>
      <Field id="phone" label={dict.account.phone} hint={dict.checkout.phoneHint} optionalLabel={dict.common.optional}>
        <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={profile.phone} maxLength={20} aria-invalid={bad("phone")} className="text-start" />
      </Field>
      <Field id="preferredLocale" label={dict.account.preferredLanguage}>
        <Select id="preferredLocale" name="preferredLocale" defaultValue={profile.preferredLocale}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <Checkbox name="marketingOptIn" defaultChecked={profile.marketingOptIn} />
        {dict.account.marketingOptIn}
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? dict.common.saving : dict.common.save}
      </Button>
    </form>
  );
}

export function AddressForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(addAddress, { status: "idle" });
  const bad = (f: string) => (state.fields?.includes(f) ? true : undefined);
  return (
    <form action={action} className="space-y-5">
      {state.status === "saved" ? <Alert tone="success">{dict.common.saved}</Alert> : null}
      {state.status === "error" ? <Alert tone="danger">{dict.checkout.errors.validation}</Alert> : null}
      <Field id="label" label={dict.account.label} optionalLabel={dict.common.optional}>
        <Input id="label" name="label" maxLength={60} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="fullName" label={dict.checkout.fullName}>
          <Input id="fullName" name="fullName" required maxLength={120} aria-invalid={bad("fullName")} />
        </Field>
        <Field id="phone" label={dict.checkout.phone}>
          <Input id="phone" name="phone" type="tel" dir="ltr" required maxLength={20} aria-invalid={bad("phone")} className="text-start" />
        </Field>
        <Field id="governorate" label={dict.checkout.governorate}>
          <Select id="governorate" name="governorate" required defaultValue="" aria-invalid={bad("governorate")}>
            <option value="">{dict.cart.selectGovernorate}</option>
            {governorates.map((g) => (
              <option key={g.code} value={g.code}>
                {g[locale]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="city" label={dict.checkout.city}>
          <Input id="city" name="city" required maxLength={80} aria-invalid={bad("city")} />
        </Field>
      </div>
      <Field id="addressLine" label={dict.checkout.address} hint={dict.checkout.addressHint}>
        <Textarea id="addressLine" name="addressLine" required rows={2} maxLength={300} aria-invalid={bad("addressLine")} />
      </Field>
      <Field id="notes" label={dict.checkout.notes} optionalLabel={dict.common.optional}>
        <Textarea id="notes" name="notes" rows={2} maxLength={300} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <Checkbox name="isDefault" />
        {dict.account.makeDefault}
      </label>
      <Button type="submit" disabled={pending}>
        {dict.account.addAddress}
      </Button>
    </form>
  );
}
