"use client";

import { cn } from "cn";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";

import { ListEnd } from "@/components/data/list-end";
import { LoadFailure } from "@/components/data/load-failure";
import { CustomerInitials } from "@/components/orders/customer-initials";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/lib/api/schema-types";
import { can } from "@/lib/auth/permissions";
import { termsText } from "@/lib/customers/labels";
import { useBands, useCustomerGroups, useCustomersList } from "@/lib/customers/queries";
import { DEFAULT_CUSTOMERS_VIEW, filtersSet, type CustomersView } from "@/lib/customers/view";
import { useMediaQuery } from "@/lib/use-media-query";

import { CustomerStatus } from "./customer-status";
import { PhoneCustomersFilters, WideCustomersFilters } from "./customers-filters";

export const customerHref = (customer: Pick<Customer, "id">) => `/customers/${customer.id}`;

/** `/customers`: every customer, newest first, searched and filtered by erp-api. */
export function CustomersPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!can(me, "customer.read")) notFound();
  return <CustomersList />;
}

function CustomersList() {
  const [view, setView] = useState<CustomersView>(DEFAULT_CUSTOMERS_VIEW);
  const list = useCustomersList(view);
  const groups = useCustomerGroups();
  const bands = useBands();
  const wide = useMediaQuery("(min-width: 768px)");
  const filterProps = {
    view,
    onChange: (patch: Partial<CustomersView>) => setView((current) => ({ ...current, ...patch })),
    // A filter whose choices can't be read isn't offered (a 403 included).
    groups: groups.data ?? null,
    bands: bands.data ?? null,
  };

  return (
    <>
      <h1 className="pt-1 text-title font-semibold">Customers</h1>
      <section aria-label="Customers" className="flex flex-col rounded-[20px] bg-card p-2 md:p-3">
        <div className="border-b border-line px-1 pt-1 pb-3">
          {wide ? <WideCustomersFilters {...filterProps} /> : <PhoneCustomersFilters {...filterProps} />}
        </div>
        {list.isPending ? (
          <div role="status" aria-label="Loading customers" className="flex flex-col gap-2 pt-3">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} aria-hidden className="h-12 animate-pulse rounded-lg bg-ground motion-reduce:animate-none" />
            ))}
          </div>
        ) : list.isError && list.items.length === 0 ? (
          <div className="px-1 pt-3">
            <LoadFailure error={list.error} fallback="Customers couldn't be loaded." onRetry={() => void list.refetch()} />
          </div>
        ) : list.items.length === 0 ? (
          <Empty filtered={filtersSet(view)} onClear={() => setView(DEFAULT_CUSTOMERS_VIEW)} />
        ) : (
          <>
            <CustomersTable customers={list.items} busy={list.isPlaceholderData} />
            <ListEnd list={list} />
          </>
        )}
      </section>
    </>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (!filtered) return <p className="px-1 py-8 text-center text-sm text-ink-2">No customers yet.</p>;
  return (
    <div className="flex flex-col items-center gap-3 px-1 py-8">
      <p className="text-sm text-ink-2">No customers match.</p>
      <Button variant="secondary" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}

function Head({ className, children }: { className?: string; children: ReactNode }) {
  return <th className={cn("px-3 pt-3 pb-2 text-left text-caption font-medium text-ink-2", className)}>{children}</th>;
}

function Cell({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("border-t border-line px-2.5 py-2.5 align-middle md:px-3", className)}>{children}</td>;
}

/** From 1280 px every column; at 768 no Plan; below that, the name with group and terms under it, and the status. */
function CustomersTable({ customers, busy }: { customers: Customer[]; busy: boolean }) {
  const router = useRouter();

  function open(event: MouseEvent<HTMLTableRowElement>, customer: Customer) {
    // The name's link handles its own clicks, a Cmd-click included.
    if ((event.target as HTMLElement).closest("a")) return;
    router.push(customerHref(customer));
  }

  return (
    <table aria-busy={busy || undefined} className={cn("w-full border-collapse text-sm transition-opacity", busy && "opacity-60")}>
      <thead className="max-md:sr-only">
        <tr>
          <Head className="md:w-[36%] xl:w-[38%]">Customer</Head>
          <Head className="hidden md:table-cell">Group</Head>
          <Head className="hidden md:table-cell">Band</Head>
          <Head className="hidden xl:table-cell">Plan</Head>
          <Head className="hidden md:table-cell">Payment terms</Head>
          <Head className="w-px">Status</Head>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => {
          const group = customer.customer_group?.name ?? "No group";
          const terms = termsText(customer.payment_terms);
          return (
            <tr
              key={customer.id}
              onClick={(event) => open(event, customer)}
              className="cursor-pointer hover:bg-panel-soft has-[a:focus-visible]:bg-panel-soft has-[a:focus-visible]:shadow-[inset_3px_0_0_var(--color-violet)]"
            >
              {/* `w-full max-w-0` on a phone gives the name only the width left over, so a long one is cut, not the table widened. */}
              <Cell className="w-full max-w-0 md:w-auto">
                <span className="flex items-start gap-2.5 md:items-center">
                  <CustomerInitials customer={customer} className="mt-0.5 md:mt-0" />
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={customerHref(customer)}
                      title={customer.name}
                      className="truncate font-semibold text-ink outline-none hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <span className="truncate text-caption text-ink-2 md:hidden">
                      {group} · {terms}
                    </span>
                  </span>
                </span>
              </Cell>
              <Cell className={cn("hidden md:table-cell", customer.customer_group ? "text-ink" : "text-ink-2")}>{group}</Cell>
              <Cell className="hidden text-ink md:table-cell">{customer.band.name}</Cell>
              <Cell className="hidden text-ink xl:table-cell">{customer.plan.name}</Cell>
              <Cell className="hidden whitespace-nowrap text-ink md:table-cell">{terms}</Cell>
              <Cell className="align-top max-md:pt-3 md:align-middle">
                <CustomerStatus status={customer.status} />
              </Cell>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
