"use client";

import type { UseFormRegisterReturn } from "react-hook-form";

import type { EligiblePartners } from "@/lib/api/schema-types";
import { useFormat } from "@/lib/format/use-format";

const FIGURES = "text-caption text-ink-2 tabular-nums";

function roomText(room: EligiblePartners["data"][number]["room"]): string | null {
  return room.length > 0 ? `Room for ${Math.min(...room.map((step) => step.left))} more` : null;
}

/** The partners to choose from with what each would cost, then those who can't take the job and why. */
export function PartnerChoices({
  eligible,
  exceptId,
  currency,
  field,
  error,
}: {
  eligible: EligiblePartners;
  /** The partner that has the job now. */
  exceptId?: string;
  currency: string;
  field: UseFormRegisterReturn;
  error?: string;
}) {
  const { money } = useFormat();
  const able = eligible.data.filter((row) => row.partner.id !== exceptId);
  const unable = eligible.ineligible.filter((row) => row.partner.id !== exceptId);

  return (
    <div className="flex flex-col gap-3">
      {able.length === 0 ? (
        <p className="text-sm text-ink">No partner can take this job right now.</p>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-sm font-medium text-ink">Partner</legend>
          {able.map((row) => (
            <label key={row.partner.id} className="flex min-h-11 items-start gap-2.5 rounded-lg px-1 py-2 text-sm hover:bg-panel-soft">
              <input type="radio" value={row.partner.id} className="mt-0.5 size-4 shrink-0 accent-violet" {...field} />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{row.partner.name}</span>
                <span className={FIGURES}>
                  {[`Costs ${money(row.cost, currency)}`, `Margin ${money(row.margin, currency)}`, roomText(row.room), row.score.overall === null ? "New" : `Score ${row.score.overall}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))}
          {error && <p className="text-caption text-late">{error}</p>}
        </fieldset>
      )}
      {unable.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium text-ink">Can&apos;t take it</h3>
          <ul className="flex flex-col gap-1.5">
            {unable.map((row) => (
              <li key={row.partner.id} className="flex flex-col text-sm">
                <span className="break-words text-ink">{row.partner.name}</span>
                <span className="text-caption text-ink-2">{row.reasons.join(" ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
