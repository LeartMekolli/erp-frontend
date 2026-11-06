"use client";

import { Building2, FileText, LifeBuoy, Users, type LucideIcon } from "lucide-react";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { SearchResponse } from "@/lib/api/schema-types";

interface Result {
  key: string;
  label: string;
  href: string;
}

function groups(results: SearchResponse): { heading: string; icon: LucideIcon; items: Result[] }[] {
  return [
    {
      heading: "Orders",
      icon: FileText,
      items: results.orders.map((o) => ({ key: `order-${o.id}`, label: `#${o.number} · ${o.customer.name}`, href: `/orders/${o.id}` })),
    },
    {
      heading: "Customers",
      icon: Building2,
      items: results.customers.map((c) => ({ key: `customer-${c.id}`, label: c.name, href: `/customers/${c.id}` })),
    },
    {
      heading: "Partners",
      icon: Users,
      items: results.partners.map((p) => ({ key: `partner-${p.id}`, label: p.name, href: `/partners/${p.id}` })),
    },
    {
      heading: "Help",
      icon: LifeBuoy,
      items: results.articles.map((a) => ({ key: `article-${a.id}`, label: a.title, href: `/help/${a.id}` })),
    },
  ];
}

export function hasResults(results: SearchResponse): boolean {
  return firstResultKey(results) !== undefined;
}

/** The first row's value, which a new answer selects. */
export function firstResultKey(results: SearchResponse): string | undefined {
  return groups(results).flatMap((group) => group.items)[0]?.key;
}

/** ⌘K's results, one group per kind; a kind with nothing found isn't shown. */
export function SearchResults({ results, onGo }: { results: SearchResponse; onGo: (href: string) => void }) {
  return groups(results)
    .filter((group) => group.items.length > 0)
    .map(({ heading, icon: Icon, items }) => (
      <CommandGroup key={heading} heading={heading}>
        {items.map((item) => (
          <CommandItem key={item.key} value={item.key} onSelect={() => onGo(item.href)} className="min-h-11">
            <Icon aria-hidden className="text-ink-2" />
            <span className="truncate">{item.label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    ));
}
