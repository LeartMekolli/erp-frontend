"use client";

import type { ReactNode } from "react";

import { LoadFailure } from "@/components/data/load-failure";
import type { Address, Customer } from "@/lib/api/schema-types";
import { useCustomerAddressBook } from "@/lib/customers/queries";
import { LOCALE } from "@/lib/format/money";

import { Fact, Panel, PanelLoading } from "./panel";

const countries = new Intl.DisplayNames(LOCALE, { type: "region" });

/** A saved address as it's written on a parcel: name, street, postal code and city, country, phone. */
function AddressText({ address }: { address: Address }) {
  const place = [`${address.postal_code} ${address.city}`, address.region].filter((part) => part && part.trim() !== "").join(", ");
  const lines = [address.name, address.line1, address.line2, place, countries.of(address.country) ?? address.country, address.phone];
  return (
    <>
      {lines
        .filter((line): line is string => line !== undefined && line.trim() !== "")
        .map((line, index) => (
          <span key={index} className="block">
            {line}
          </span>
        ))}
    </>
  );
}

/** Where the customer ships and bills, its VAT number, and whether its people pick the workshop. `action` is its Edit, for staff who may change it. */
export function DetailsPanel({ customer, action }: { customer: Customer; action?: ReactNode }) {
  const book = useCustomerAddressBook(customer.id);
  return (
    <Panel title="Details" action={action}>
      {book.isPending ? (
        <PanelLoading label="Loading the details" />
      ) : book.isError ? (
        <LoadFailure error={book.error} fallback="The details couldn't be loaded." onRetry={() => void book.refetch()} />
      ) : (
        <dl className="flex flex-col gap-3.5">
          <Fact term="Ships to">{book.data.shipping_address ? <AddressText address={book.data.shipping_address} /> : <span className="text-ink-2">No shipping address yet</span>}</Fact>
          <Fact term="Bills to">
            {book.data.billing_address ? (
              <AddressText address={book.data.billing_address} />
            ) : book.data.shipping_address ? (
              "Same as shipping"
            ) : (
              <span className="text-ink-2">No billing address yet</span>
            )}
          </Fact>
          <Fact term="VAT number" inline>
            {book.data.vat_number ?? <span className="text-ink-2">None</span>}
          </Fact>
          <Fact term="Picks the workshop" inline>
            {customer.may_pick_partner ? "Yes" : "No"}
          </Fact>
        </dl>
      )}
    </Panel>
  );
}
