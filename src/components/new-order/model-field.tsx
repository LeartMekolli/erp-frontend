"use client";

import { Box } from "lucide-react";
import { useId, type DragEvent } from "react";
import { useFormContext } from "react-hook-form";

import { UploadStatus } from "@/components/data/upload-status";
import { Button } from "@/components/ui/button";
import type { CatalogProduct } from "@/lib/api/schema-types";
import type { NewOrderValues } from "@/lib/new-order/form";
import { fileSize, modelMeasures } from "@/lib/new-order/model";

import { COPY } from "./copy";
import { Panel } from "./panel";
import type { useModel } from "./use-model";

const UNITS = ["mm", "cm", "m", "in"] as const;

type Model = Pick<ReturnType<typeof useModel>, "held" | "upload" | "readyVersionId" | "measures" | "waitingForCustomer" | "canUpload" | "choose" | "remove">;

/**
 * The Model panel: the 3D model of the order. A drop zone until a file is held (any product: the file is
 * taken before the product is picked), then a card with the file, where it is, the unit it is drawn in
 * and, once measured, what the server measured. Without `file.write` it says why there is no input.
 * A product that isn't custom says it doesn't use a model instead of the status and measures.
 */
export function ModelCard({ model, product, reasons = [] }: { model: Model; product?: Pick<CatalogProduct, "kind">; reasons?: readonly string[] }) {
  const { held, upload, canUpload, choose } = model;
  const { register } = useFormContext<NewOrderValues>();
  const unitLabelId = useId();
  const reasonsId = useId();
  // erp-api's reasons for refusing the model are read with the file input, which is marked invalid.
  const refused = reasons.length > 0 ? { "aria-invalid": true, "aria-describedby": reasonsId } : {};
  const unit = register("declaredUnit");
  const unused = product !== undefined && product.kind !== "custom";

  const pick = (file: File | undefined) => {
    if (file) choose(file);
  };

  if (!canUpload) {
    return (
      <Panel title={COPY.model.label}>
        <p className="text-sm text-ink">{COPY.model.noAccess}</p>
        <Reasons id={reasonsId} reasons={reasons} />
      </Panel>
    );
  }

  if (!held) {
    return (
      <Panel title={COPY.model.label}>
        <label
          onDragOver={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => {
            event.preventDefault();
            pick(event.dataTransfer.files[0]);
          }}
          className="flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm font-medium text-ink-2 hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet"
        >
          <Box aria-hidden className="size-5 shrink-0" />
          <span>{COPY.model.drop}</span>
          <input
            type="file"
            aria-label={COPY.model.upload}
            {...refused}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              pick(file);
            }}
          />
        </label>
        {unused && <p className="text-sm text-ink-2">{COPY.model.notUsed}</p>}
        <Reasons id={reasonsId} reasons={reasons} />
      </Panel>
    );
  }

  const measures = modelMeasures(model.measures);
  const shown = [
    { key: "volume", label: COPY.model.measures.volume, value: measures.volume },
    { key: "size", label: COPY.model.measures.size, value: measures.size },
    { key: "surface", label: COPY.model.measures.surface, value: measures.surface },
  ].filter((measure) => measure.value !== null);

  return (
    <Panel
      title={COPY.model.label}
      action={
        // A label around a hidden input: the whole pill opens the file picker, and the input keeps focus and the name.
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-ink/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-violet has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {COPY.model.replace}
          <input
            type="file"
            {...refused}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              pick(file);
            }}
          />
        </label>
      }
    >
      <div className="flex items-start gap-3.5">
        <div aria-hidden className="grid size-[76px] shrink-0 place-items-center rounded-2xl bg-lilac text-violet-ink">
          <Box className="size-8" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold break-all text-ink">{held.name}</p>
            <p className="text-sm text-ink-2 tabular-nums">{fileSize(held.size)}</p>
          </div>
          {unused ? (
            <p className="text-sm text-ink-2">{COPY.model.notUsed}</p>
          ) : model.waitingForCustomer ? (
            <p className="text-sm text-ink-2">{COPY.model.waiting}</p>
          ) : (
            <UploadStatus upload={upload} />
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span id={unitLabelId} className="text-caption font-medium text-ink">
              {COPY.model.unit}
            </span>
            {/* Native radios, so the arrow keys move between units. The unit is baked into the uploaded
                version; `useModel` uploads the held file again when it changes. */}
            <div role="radiogroup" aria-labelledby={unitLabelId} className="inline-flex rounded-full border border-line p-0.5">
              {UNITS.map((value) => (
                <label key={value} className="relative">
                  <input type="radio" value={value} {...unit} className="peer sr-only" />
                  <span className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium text-ink-2 peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                    {COPY.model.units[value]}
                  </span>
                </label>
              ))}
            </div>
            <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={model.remove}>
              {COPY.model.remove}
            </Button>
          </div>
        </div>
      </div>
      {!unused && shown.length > 0 && (
        <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
          {shown.map((measure) => (
            <div key={measure.key} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-ink-2">{measure.label}</dt>
              <dd className="text-xl font-semibold break-words text-ink tabular-nums">{measure.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Reasons id={reasonsId} reasons={reasons} />
    </Panel>
  );
}

/** erp-api's reasons for refusing the model, in words, in the red that's readable as text. */
function Reasons({ id, reasons }: { id: string; reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul id={id} className="flex flex-col gap-0.5 text-caption text-late-ink">
      {reasons.map((reason, index) => (
        <li key={index}>{reason}</li>
      ))}
    </ul>
  );
}
