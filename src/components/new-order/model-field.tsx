"use client";

import { useFormContext } from "react-hook-form";

import { UploadStatus } from "@/components/data/upload-status";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { NewOrderValues } from "@/lib/new-order/form";
import type { useUpload } from "@/lib/upload/use-upload";

import { COPY } from "./copy";
import { FieldRow } from "./field-row";
import type { useModel } from "./use-model";

export type ModelUpload = ReturnType<typeof useUpload>;

const UNITS = ["mm", "cm", "m", "in"] as const;

/** The version id of the model once it is measured; undefined while uploading, measuring or failed. */
export function readyVersionId(upload: ModelUpload): string | undefined {
  return upload.phase === "done" ? upload.versionId : undefined;
}

/**
 * The 3D model of a custom product: the unit it is drawn in, asked before the file, then the file.
 * Without `file.write` it says why there is no input, since the quote can't be priced without a model.
 */
export function ModelField({ model, reasons = [] }: { model: Pick<ReturnType<typeof useModel>, "upload" | "choose" | "canUpload">; reasons?: readonly string[] }) {
  const { upload, choose, canUpload } = model;
  const { register } = useFormContext<NewOrderValues>();

  if (!canUpload) {
    return (
      <FieldRow label={COPY.model.label} problems={reasons}>
        {() => <p className="py-3 text-sm text-ink">{COPY.model.noAccess}</p>}
      </FieldRow>
    );
  }

  const done = upload.phase === "done";
  const unit = register("declaredUnit");
  return (
    <>
      <FieldRow label={COPY.model.unit}>
        {(props) => (
          // The unit is baked into the uploaded version; `useModel` uploads the held file again when it changes.
          <NativeSelect {...props} {...unit}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {COPY.model.units[unit]}
              </option>
            ))}
          </NativeSelect>
        )}
      </FieldRow>
      <FieldRow label={done ? COPY.model.replace : COPY.model.upload} problems={reasons}>
        {(props) => (
          <>
            <Input
              {...props}
              type="file"
              className="py-2.5"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) choose(file);
              }}
            />
            <UploadStatus upload={upload} />
          </>
        )}
      </FieldRow>
    </>
  );
}
