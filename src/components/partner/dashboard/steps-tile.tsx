import { Columns } from "@/components/charts/columns";
import { compactAxis } from "@/components/charts/scale-helpers";
import { CHART } from "@/components/charts/tokens";
import { Tile } from "@/components/dashboard/tile";
import type { PartnerSummary } from "@/lib/api/schema-types";

/**
 * The pieces at each of the workshop's steps right now, one column per step in erp-api's order. Late
 * pieces are part of each column, so they aren't stacked on it (a status colour is never a series):
 * they're named in words under the chart, as on the staff dashboard.
 */
export function StepsTile({ summary, width }: { summary: PartnerSummary | undefined; width?: number }) {
  const late = summary?.steps.filter((step) => step.late > 0) ?? [];
  return (
    <Tile span={5} title="Pieces at your steps now" aside={<span className="text-caption text-ink-2">live</span>}>
      {!summary ? (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Loading your steps…
        </p>
      ) : summary.steps.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">No pieces at your steps right now.</p>
      ) : (
        <>
          <div className="mt-3">
            <Columns
              label="Pieces at each of your steps now"
              data={summary.steps.map((step) => ({ key: step.key, label: step.name, values: [step.on_track + step.late] }))}
              series={[{ name: "Pieces", color: CHART.violet }]}
              height={180}
              format={String}
              axis={(value) => compactAxis(value)}
              width={width}
            />
          </div>
          {late.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-late-ink">
                <span aria-hidden className="size-2 rounded-full bg-late" />
                Late
              </span>
              {late.map((step) => `${step.name} ${step.late}`).join(" · ")}
            </p>
          )}
        </>
      )}
    </Tile>
  );
}
