"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import type { ReactNode } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import { CustomerInitials } from "@/components/orders/customer-initials";
import { useMe } from "@/components/session/session-gate";
import { Button } from "@/components/ui/button";
import { isApiProblem } from "@/lib/api/problem";
import type { Customer } from "@/lib/api/schema-types";
import { can, useCanPlaceOrders } from "@/lib/auth/permissions";
import { useCustomerDetail } from "@/lib/customers/queries";
import { LOCALE } from "@/lib/format/money";
import { leaveArrivalNote, opensHere } from "@/lib/navigation/arrival-note";
import { useFormat } from "@/lib/format/use-format";

import { EditCustomerButton, EditDetailsButton, EditTermsButton } from "./customer-edits";
import { CustomerStatus } from "./customer-status";
import { DetailsPanel } from "./details-panel";
import { StatusAction } from "./disable-dialog";
import { MoneyPanel } from "./money-panel";
import { OrdersPanel } from "./orders-panel";

/** What the person may see and do on a customer's page. */
export interface CustomerAccess {
  readMoney: boolean;
  readOrders: boolean;
  edit: boolean;
  editTerms: boolean;
  placeOrders: boolean;
}

/** `/customers/:id`: who the customer is, its orders by month, and its details and money beside them. */
export function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const placeOrders = useCanPlaceOrders();
  if (!me) return null;
  if (!can(me, "customer.read")) notFound();
  const access: CustomerAccess = {
    readMoney: can(me, "payment.read"),
    readOrders: can(me, "order.read"),
    edit: can(me, "customer.write"),
    editTerms: can(me, "payment.write"),
    placeOrders,
  };
  return <CustomerView id={id} access={access} />;
}

function BackToCustomers() {
  return (
    <Button asChild variant="link" className="self-start max-md:hidden">
      <Link href="/customers">Customers</Link>
    </Button>
  );
}

function CustomerView({ id, access }: { id: string; access: CustomerAccess }) {
  const query = useCustomerDetail(id);

  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading the customer" className="flex flex-col gap-3.5 pt-1">
        <div className="h-14 w-80 max-w-full animate-pulse rounded-2xl bg-card motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-[20px] bg-card motion-reduce:animate-none" />
      </div>
    );
  }

  if (!query.data) {
    if (isApiProblem(query.error) && query.error.status === 404) {
      return (
        <section className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-6 py-7">
          <h1 className="text-title font-semibold">This customer doesn&apos;t exist or was removed.</h1>
          <Button asChild variant="link" className="self-start">
            <Link href="/customers">Back to customers</Link>
          </Button>
        </section>
      );
    }
    return (
      <section className="flex flex-col items-start gap-3 rounded-[20px] bg-card px-6 py-7">
        <BackToCustomers />
        <LoadFailure error={query.error} fallback="This customer couldn't be loaded." onRetry={() => void query.refetch()} />
      </section>
    );
  }

  const customer = query.data;
  const newOrder = access.placeOrders && customer.status === "active" ? <NewOrderButton customerId={customer.id} /> : null;
  const side = (
    <>
      <DetailsPanel customer={customer} action={access.edit ? <EditDetailsButton customer={customer} /> : undefined} />
      {access.readMoney && <MoneyPanel customerId={customer.id} action={access.editTerms ? <EditTermsButton customer={customer} /> : undefined} />}
    </>
  );

  return (
    <>
      <BackToCustomers />
      <Header customer={customer} access={access} newOrder={newOrder} />
      {access.readOrders ? (
        <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <OrdersPanel customerId={customer.id} empty={newOrder} />
          <div className="grid items-start gap-3 max-xl:-order-1 md:grid-cols-2 md:gap-3.5 xl:grid-cols-1">{side}</div>
        </div>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 md:gap-3.5">{side}</div>
      )}
    </>
  );
}

const sinceFormat = new Map<string, Intl.DateTimeFormat>();

/** "Customer since March 2026", in the workspace's zone. */
function since(iso: string, timeZone: string): string {
  let formatter = sinceFormat.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone });
    sinceFormat.set(timeZone, formatter);
  }
  return `Customer since ${formatter.format(new Date(iso))}`;
}

/** New order for this customer: a click that opens here leaves New order a note to start with them picked. */
function NewOrderButton({ customerId }: { customerId: string }) {
  return (
    <Button asChild>
      <Link
        href="/orders/new"
        onClick={(event) => {
          if (opensHere(event)) leaveArrivalNote("/orders/new", { customer: customerId });
        }}
      >
        <Plus aria-hidden />
        New order
      </Link>
    </Button>
  );
}

function Header({ customer, access, newOrder }: { customer: Customer; access: CustomerAccess; newOrder: ReactNode }) {
  const { timeZone } = useFormat();
  const facts = [customer.customer_group?.name, `${customer.band.name} band`, `${customer.plan.name} plan`, since(customer.created_at, timeZone)].filter(
    (fact): fact is string => Boolean(fact),
  );
  const disabled = customer.status === "disabled";

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 md:flex-nowrap md:items-center">
        <CustomerInitials customer={customer} className="size-11 text-[15px] md:size-13 md:text-[17px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-title font-semibold text-balance break-words">{customer.name}</h1>
          <p className="flex flex-wrap items-center gap-y-0.5 text-caption text-ink-2 md:text-sm">
            <CustomerStatus status={customer.status} />
            {facts.map((fact) => (
              <span key={fact} className="before:mx-2 before:text-line before:content-['·']">
                {fact}
              </span>
            ))}
          </p>
        </div>
        {(access.edit || newOrder) && (
          <div className="flex w-full items-center gap-2 md:w-auto md:shrink-0">
            {access.edit && <EditCustomerButton customer={customer} />}
            {access.edit && <StatusAction customer={customer} />}
            {/* Last on a desktop, as the main action; first and full width on a phone. */}
            {newOrder && <div className="max-md:order-first max-md:flex-1 max-md:[&>a]:w-full">{newOrder}</div>}
          </div>
        )}
      </div>
      {disabled && access.placeOrders && (
        <p className="w-full rounded-xl bg-panel-soft px-3.5 py-3 text-sm text-ink-2">
          New orders aren&apos;t offered while {customer.name} is disabled. Its orders and details stay below.
        </p>
      )}
    </header>
  );
}
