import { notFound } from "next/navigation";

/** Anything under `/partners/:id/...` has no page. */
export default function PartnersSubpage() {
  notFound();
}
