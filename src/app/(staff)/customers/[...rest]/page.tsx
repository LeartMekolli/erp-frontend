import { notFound } from "next/navigation";

/** Anything under `/customers/:id/...` has no page. */
export default function CustomersSubpage() {
  notFound();
}
