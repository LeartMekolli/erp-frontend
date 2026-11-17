"use client";

import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { LoadFailure } from "@/components/data/load-failure";
import { ShipChoice } from "@/components/orders/ship-choice";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  RADIO_LIMIT,
  defaultOptions,
  optionFields,
  quantityError,
  sizeError,
  type NewOrderValues,
  type OptionField,
} from "@/lib/new-order/form";
import { useCustomerProducts, useDeliverySpeeds, useOptionGroups } from "@/lib/new-order/queries";

import { COPY } from "./copy";
import { FieldRow } from "./field-row";
import { ModelField, type ModelUpload } from "./model-field";

/** The fields of the form a quote refusal can belong to (`refusalField` in `form.ts`). */
export type RefusedField = "options" | "size" | "model" | "quantity";

/** erp-api's reasons for refusing the quote, under the field each belongs to. */
export type Refusals = ReadonlyMap<RefusedField, readonly string[]>;

const NO_REASONS: readonly string[] = [];

/**
 * Section 2: the product the customer can see, its options, size, quantity, model (custom products)
 * and delivery speed. Picking a product starts its options from the defaults and clears the size and
 * the model, so nothing of the last product is quoted.
 */
export function ProductSection({ refusals, upload }: { refusals: Refusals; upload: ModelUpload }) {
  const { control, getValues, setValue, register } = useFormContext<NewOrderValues>();
  const customerId = useWatch({ control, name: "customerId" });
  const productId = useWatch({ control, name: "productId" });
  const options = useWatch({ control, name: "options" });
  const size = useWatch({ control, name: "size" });
  const quantity = useWatch({ control, name: "quantity" });
  const speed = useWatch({ control, name: "speed" });

  const products = useCustomerProducts(customerId || null);
  const groups = useOptionGroups();
  const speeds = useDeliverySpeeds(customerId || null);

  // The upload belongs to this customer's product, so it goes when this section does (another customer
  // closes the section first). The latest upload sits in a ref so the cleanup runs on unmount only.
  const latestUpload = useRef(upload);
  useEffect(() => {
    latestUpload.current = upload;
  });
  useEffect(() => () => latestUpload.current.reset(), []);

  // Start from the plan's default speed; with exactly one speed that one, with none leave it for erp-api.
  const speedList = speeds.data;
  useEffect(() => {
    if (!speedList || speedList.some((choice) => choice.key === getValues("speed"))) return;
    const pick = speedList.find((choice) => choice.is_default) ?? (speedList.length === 1 ? speedList[0] : undefined);
    setValue("speed", pick?.key ?? "");
  }, [speedList, getValues, setValue]);

  const product = products.data?.find((p) => p.id === productId);
  const fields = product && groups.data ? optionFields(product, groups.data) : [];

  function chooseProduct(id: string) {
    const chosen = products.data?.find((p) => p.id === id);
    if (!chosen || !groups.data) return;
    setValue("productId", id, { shouldDirty: true });
    // A whole new record: keys of the last product's groups must not stay behind, the quote would send them.
    setValue("options", defaultOptions(chosen, groups.data), { shouldDirty: true });
    setValue("size", "", { shouldDirty: true });
    upload.reset();
  }

  function chooseOption(key: string, value: string) {
    setValue("options", { ...getValues("options"), [key]: value }, { shouldDirty: true });
  }

  const optionReasons = refusals.get("options") ?? NO_REASONS;
  const sizeReasons = refusals.get("size") ?? NO_REASONS;
  const quantityReasons = refusals.get("quantity") ?? NO_REASONS;
  const sizeProblem = product && size !== "" ? sizeError(product.sizing, size) : null;
  const quantityProblem = quantityError(quantity);

  return (
    <div className="flex flex-col gap-4">
      {products.isPending && <p className="text-sm text-ink-2">{COPY.product.loading}</p>}
      {products.isError && <LoadFailure error={products.error} fallback={COPY.product.loadFailed} onRetry={() => void products.refetch()} />}
      {products.data && products.data.length === 0 && <p className="text-sm text-ink-2">{COPY.product.none}</p>}
      {groups.isPending && <p className="text-sm text-ink-2">{COPY.product.optionsLoading}</p>}
      {groups.isError && <LoadFailure error={groups.error} fallback={COPY.product.optionsFailed} onRetry={() => void groups.refetch()} />}

      {products.data && products.data.length > 0 && (
        <FieldRow label={COPY.product.label}>
          {(props) => (
            <NativeSelect {...props} value={productId} disabled={!groups.data} onChange={(event) => chooseProduct(event.target.value)}>
              <option value="" disabled>
                {COPY.product.placeholder}
              </option>
              {products.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.customer_id ? `${p.name} · ${COPY.product.theirOwn}` : p.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FieldRow>
      )}

      {product && (
        <>
          {fields.map((field, index) => (
            <OptionRow
              key={`${product.id}:${field.key}`}
              field={field}
              value={options[field.key] ?? ""}
              onChoose={(value) => chooseOption(field.key, value)}
              invalid={optionReasons.length > 0}
              problems={index === fields.length - 1 ? optionReasons : NO_REASONS}
            />
          ))}

          {product.sizing.mode === "range" && (
            <FieldRow
              label={COPY.product.size}
              hint={COPY.product.sizeHint(product.sizing.min, product.sizing.max)}
              problems={sizeProblem ? [sizeProblem, ...sizeReasons] : sizeReasons}
            >
              {(props) => <Input {...props} inputMode="decimal" autoComplete="off" value={size} onChange={(event) => setValue("size", event.target.value, { shouldDirty: true })} />}
            </FieldRow>
          )}
          {product.sizing.mode === "named" && (
            <FieldRow label={COPY.product.size} problems={sizeProblem ? [sizeProblem, ...sizeReasons] : sizeReasons}>
              {(props) => (
                <NativeSelect {...props} value={size} onChange={(event) => setValue("size", event.target.value, { shouldDirty: true })}>
                  <option value="" disabled>
                    {COPY.product.sizePlaceholder}
                  </option>
                  {product.sizing.mode === "named" &&
                    product.sizing.sizes.map((named) => (
                      <option key={named.key} value={named.key}>
                        {named.key}
                      </option>
                    ))}
                </NativeSelect>
              )}
            </FieldRow>
          )}

          {product.kind === "custom" && <ModelField upload={upload} reasons={refusals.get("model")} />}

          <FieldRow label={COPY.product.quantity} problems={quantityProblem ? [quantityProblem, ...quantityReasons] : quantityReasons}>
            {(props) => <Input {...props} {...register("quantity")} inputMode="numeric" autoComplete="off" />}
          </FieldRow>

          {speeds.isPending && <p className="text-sm text-ink-2">{COPY.product.speedsLoading}</p>}
          {speeds.isError && <LoadFailure error={speeds.error} fallback={COPY.product.speedsFailed} onRetry={() => void speeds.refetch()} />}
          {speedList && speedList.length > 1 && (
            <FieldRow label={COPY.product.speed}>
              {speedList.map((choice) => (
                <ShipChoice
                  key={choice.key}
                  name="delivery-speed"
                  value={choice.key}
                  label={`${choice.name} · ${COPY.product.workingDays(choice.working_days)}`}
                  choice={speed}
                  onChoose={(next) => setValue("speed", next, { shouldDirty: true })}
                />
              ))}
            </FieldRow>
          )}
        </>
      )}
    </div>
  );
}

/** One option group: radios up to `RADIO_LIMIT` values, a select above. An optional group with no default can be left out. */
function OptionRow({
  field,
  value,
  onChoose,
  invalid,
  problems,
}: {
  field: OptionField;
  value: string;
  onChoose: (value: string) => void;
  invalid: boolean;
  problems: readonly string[];
}) {
  // erp-api prices a group left out as its default, so "None" is only honest where there is no default.
  const canLeaveOut = !field.required && !field.hasDefault;
  if (field.values.length > RADIO_LIMIT) {
    return (
      <FieldRow label={field.name} invalid={invalid} problems={problems}>
        {(props) => (
          <NativeSelect {...props} value={value} onChange={(event) => onChoose(event.target.value)}>
            {(canLeaveOut || value === "") && (
              <option value="" disabled={!canLeaveOut}>
                {canLeaveOut ? COPY.product.noChoice : COPY.product.placeholder}
              </option>
            )}
            {field.values.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FieldRow>
    );
  }
  return (
    <FieldRow label={field.name} invalid={invalid} problems={problems}>
      {field.values.map((option) => (
        <ShipChoice key={option.key} name={`option-${field.key}`} value={option.key} label={option.name} choice={value} onChoose={onChoose} />
      ))}
      {canLeaveOut && <ShipChoice name={`option-${field.key}`} value="" label={COPY.product.noChoice} choice={value} onChoose={onChoose} />}
    </FieldRow>
  );
}
