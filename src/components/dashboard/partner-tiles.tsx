"use client";

import { MeterList } from "@/components/charts/meter-list";
import { amountForScale, compactAxis } from "@/components/charts/scale-helpers";
import { TrendChart } from "@/components/charts/trend-chart";
import type { DashboardRange } from "@/lib/api/schema-types";
import { addMoney, formatMoney } from "@/lib/format/money";

import { bucketLabel, percent, shareOf } from "./headline";
import { Tile } from "./tile";

/** erp-api's "near capacity" line (`attention.service.ts` `NEAR_CAPACITY_PERCENT`). */
const NEAR_CAPACITY_PERCENT = 90;

const negate = (amount: string) => (amount.startsWith("-") ? amount.slice(1) : `-${amount}`);

/**
 * The partner tiles, for staff with `partner.read` (erp-api leaves `partners` out otherwise): how loaded
 * each workshop is and how often it's on time, and what partners cost against revenue.
 */
export function PartnerTiles({ range, chartWidth }: { range: DashboardRange; chartWidth?: number }) {
  const partners = range.current.partners;
  if (!partners) return null;
  return (
    <>
      <Tile span={4} title="Partner load">
        <div className="mt-3">
          <MeterList
            label="Load against capacity"
            rows={partners.load.map((partner) => ({
              key: partner.id,
              label: partner.name,
              value: partner.percent / 100,
              display: `${partner.percent}%`,
              ...(partner.percent >= NEAR_CAPACITY_PERCENT ? { warn: "Near capacity" } : {}),
            }))}
          />
        </div>
        {partners.on_time.length > 0 && (
          <>
            <h3 className="mt-4 text-caption text-ink-2">On time</h3>
            <div className="mt-2">
              <MeterList
                label="Partners on time"
                rows={partners.on_time.map((partner) => ({ key: partner.id, label: partner.name, value: partner.rate, display: percent(partner.rate) }))}
              />
            </div>
          </>
        )}
      </Tile>
      <PartnerCost range={range} width={chartWidth} />
    </>
  );
}

/** Revenue and partner cost per bucket on one axis, with the margin between them in words. */
function PartnerCost({ range, width }: { range: DashboardRange; width?: number }) {
  const cost = range.current.partners?.cost;
  const revenue = range.current.orders.revenue;
  if (!cost || revenue === undefined) return null;
  const currency = range.current.currency;
  const margin = addMoney(revenue, negate(cost.amount));
  const share = shareOf(margin, revenue);
  const scaled = (amount: string | undefined) => (amount === undefined ? null : amountForScale(amount));

  return (
    <Tile span={4} title="Partner cost against revenue">
      <p className="mt-2 text-sm text-ink">
        {"Margin "}
        <span className="font-semibold">{formatMoney(margin, currency)}</span>
        {share !== null && <span className="text-ink-2">{` · ${share}% of revenue`}</span>}
      </p>
      <p className="text-caption text-ink-2">{`Partners cost ${formatMoney(cost.amount, cost.currency)} of ${formatMoney(revenue, currency)}`}</p>
      <div className="mt-3">
        <TrendChart
          label={`Revenue and partner cost by ${range.range.bucket}`}
          names={{ value: "Revenue", previous: "Partner cost" }}
          tone="light"
          height={160}
          points={range.series.map((point) => ({ at: point.start, value: scaled(point.revenue), previous: scaled(point.partner_cost) }))}
          format={(value) => formatMoney(String(value), currency)}
          axis={(value) => compactAxis(value, currency)}
          dateLabel={(at) => bucketLabel(at, range.range.bucket)}
          width={width}
        />
      </div>
      <ul role="list" className="mt-2 flex flex-wrap gap-x-4 text-caption text-ink-2">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-violet" />
          Revenue
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-[#c9c7d4]" />
          Partner cost
        </li>
      </ul>
    </Tile>
  );
}
