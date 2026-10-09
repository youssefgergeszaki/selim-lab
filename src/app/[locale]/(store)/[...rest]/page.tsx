import { notFound } from "next/navigation";

/** Unmatched localized URLs render the localized 404 inside the store layout. */
export default function CatchAll() {
  notFound();
}
