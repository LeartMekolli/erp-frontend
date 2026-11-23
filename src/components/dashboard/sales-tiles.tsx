"use client";

import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { Columns } from "@/components/charts/columns";
import { HBars } from "@/components/charts/hbars";
import { amountForScale, compactAxis } from "@/components/charts/scale-helpers";
import { SplitBar } from "@/components/charts/split-bar";
import { CHART } from "@/components/charts/tokens";
import type { DashboardRange } from "@/lib/api/schema-types";
import { useDashboardRange } from "@/lib/dashboard/queries";
import { formatDay } from "@/lib/format/dates";
import { formatMoney } from "@/lib/format/money";

import { bucketLabel, rangeDays } from "./headline";
import { Tile } from "./tile";

const counts = (value: number) => String(value);

/** The Monday of a calendar day's ISO week, as `YYYY-MM-DD`. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Orders per week: erp-api's weeks or months as they come, its days added up into ISO weeks. */
export function ordersByWeek(range: DashboardRange): { start: string; orders: number }[] {
  if (range.range.bucket !== "day") return range.series.map((point) => ({ start: point.start, orders: point.orders_placed }));
  const weeks = new Map<string, number>();
  for (const point of range.series) {
    const week = mondayOf(point.start);
    weeks.set(week, (weeks.get(week) ?? 0) + point.orders_placed);
  }
  return [...weeks].map(([start, orders]) => ({ start: start < range.range.from ? range.range.from : start, orders }));
}

/**
 * The sales and customer tiles: orders per week, where revenue comes from (money readers only), the
 * year of orders by day, and the top customers. Pass `chartWidth` to skip measuring (tests).
 */
export function SalesTiles({ range, today, chartWidth }: { range: DashboardRange; today: string; chartWidth?: number }) {
  return (
    <>
      <OrdersPerWeek range={range} width={chartWidth} />
      <RevenueSplit range={range} />
      <OrdersByDay today={today} width={chartWidth} />
      <TopCustomers range={range} />
    </>
  );
}

function OrdersPerWeek({ range, width }: { range: DashboardRange; width?: number }) {
  const monthly = range.range.bucket === "month";
  const buckets = ordersByWeek(range);
  return (
    <Tile span={4} title={monthly ? "Orders per month" : "Orders per week"}>
      <div className="mt-3">
        <Columns
          label={monthly ? "Orders placed each month" : "Orders placed each week"}
          data={buckets.map((bucket) => ({ key: bucket.start, label: bucketLabel(bucket.start, monthly ? "month" : "week"), values: [bucket.orders] }))}
          series={[{ name: "Orders", color: CHART.violet }]}
          highlight={buckets.length - 1}
          height={180}
          format={counts}
          axis={(value) => compactAxis(value)}
          empty={`No orders in these ${rangeDays(range)} days`}
          width={width}
        />
      </div>
    </Tile>
  );
}

/** Revenue by product and by customer group, as two split bars; only for staff who may see money. */
function RevenueSplit({ range }: { range: DashboardRange }) {
  const { by_product: products, by_customer_group: groups } = range.current.orders;
  if (!products || !groups) return null;
  const currency = range.current.currency;
  const money = (amount: string) => formatMoney(amount, currency);
  return (
    <Tile span={4} title="Where revenue comes from">
      <h3 className="mt-3 text-caption text-ink-2">By product</h3>
      <div className="mt-1.5">
        <SplitBar
          label="Revenue by product"
          parts={products.map((product) => ({ key: product.product_id, label: product.name, value: amountForScale(product.revenue), display: money(product.revenue) }))}
        />
      </div>
      <h3 className="mt-4 text-caption text-ink-2">By customer group</h3>
      <div className="mt-1.5">
        <SplitBar
          label="Revenue by customer group"
          parts={groups.map((group) => ({
            key: group.customer_group?.id ?? "none",
            label: group.customer_group?.name ?? "No group",
            value: amountForScale(group.revenue),
            display: money(group.revenue),
          }))}
        />
      </div>
    </Tile>
  );
}

/** A year of orders by day, this calendar year up to today; on a phone, the latest weeks that fit. */
function OrdersByDay({ today, width }: { today: string; width?: number }) {
  const year = Number(today.slice(0, 4));
  const days = useDashboardRange({ from: `${today.slice(0, 4)}-01-01`, to: today, bucket: "day" });
  if (!days.data) return null;
  return (
    <Tile span={8} title={`Orders by day, ${year}`}>
      <div className="mt-3">
        <CalendarHeatmap
          label={`Orders placed each day in ${year}`}
          year={year}
          days={days.data.series.map((point) => ({ on: point.start, count: point.orders_placed }))}
          today={today}
          dateLabel={formatDay}
          empty={`No orders yet in ${year}`}
          fitToWidth
          width={width}
        />
      </div>
    </Tile>
  );
}

/** The customers who ordered most, with revenue for money readers, then who is ordering less. */
function TopCustomers({ range }: { range: DashboardRange }) {
  const { top, ordering_less: orderingLess } = range.current.customers;
  const currency = range.current.currency;
  const withRevenue = top.every((customer) => customer.revenue !== undefined);
  return (
    <Tile span={4} title="Top customers">
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">{`No orders in these ${rangeDays(range)} days`}</p>
      ) : withRevenue ? (
        <div className="mt-3">
          <HBars
            label="Top customers by revenue"
            data={top.map((customer) => ({
              key: customer.id,
              label: customer.name,
              value: amountForScale(customer.revenue!),
              display: formatMoney(customer.revenue!, currency),
            }))}
          />
        </div>
      ) : (
        <ol aria-label="Top customers" className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink">
          {top.map((customer) => (
            <li key={customer.id}>{customer.name}</li>
          ))}
        </ol>
      )}
      {orderingLess.length > 0 && (
        <p className="mt-3 text-caption text-warn">
          <span aria-hidden>▲ </span>
          {`Ordering less: ${orderingLess.map((customer) => `${customer.name}, last order ${bucketLabel(customer.last_order_on, "day")}`).join("; ")}`}
        </p>
      )}
    </Tile>
  );
}
