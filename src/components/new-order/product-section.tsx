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
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import { FieldRow } from "./field-row";
import { QuantityField } from "./quantity-field";

/** The fields of the form a quote refusal can belong to (`refusalField` in `form.ts`). */
export type RefusedField = "options" | "size" | "model" | "quantity";

/** erp-api's reasons for refusing the quote, under the field each belongs to. */
export type Refusals = ReadonlyMap<RefusedField, readonly string[]>;

const NO_REASONS: readonly string[] = [];

/**
 * The product the customer can see, its options (the material as tiles), then size, quantity and
 * delivery speed in one row, mounted once a customer is picked. Picking a product starts its options from the defaults and clears the size.
 * When the product select is ready, focus moves to it once for each customer.
 */
export function ProductSection({ refusals }: { refusals: Refusals }) {
  const { control, getValues, setValue } = useFormContext<NewOrderValues>();
  const productSelect = useRef<HTMLSelectElement>(null);
  const focusedFor = useRef<string | null>(null);
  const customerId = useWatch({ control, name: "customerId" });
  const productId = useWatch({ control, name: "productId" });
  const options = useWatch({ control, name: "options" });
  const size = useWatch({ control, name: "size" });
  const quantity = useWatch({ control, name: "quantity" });
  const speed = useWatch({ control, name: "speed" });

  const products = useCustomerProducts(customerId || null);
  const groups = useOptionGroups();
  const speeds = useDeliverySpeeds(customerId || null);

  // Start from the plan's default speed; with exactly one speed that one, with none leave it for erp-api.
  const speedList = speeds.data;
  useEffect(() => {
    if (!speedList || speedList.some((choice) => choice.key === getValues("speed"))) return;
    const pick = speedList.find((choice) => choice.is_default) ?? (speedList.length === 1 ? speedList[0] : undefined);
    setValue("speed", pick?.key ?? "");
  }, [speedList, getValues, setValue]);

  // Once a customer's products and the option groups have loaded, the select is the next thing to fill in:
  // once for each customer, so another one picked brings focus back even if this section stayed mounted.
  const selectReady = (products.data?.length ?? 0) > 0 && groups.data !== undefined;
  useEffect(() => {
    if (!selectReady || focusedFor.current === customerId) return;
    focusedFor.current = customerId;
    productSelect.current?.focus();
  }, [selectReady, customerId]);

  const product = products.data?.find((p) => p.id === productId);
  const fields = product && groups.data ? optionFields(product, groups.data) : [];

  function chooseProduct(id: string) {
    const chosen = products.data?.find((p) => p.id === id);
    if (!chosen || !groups.data) return;
    setValue("productId", id, { shouldDirty: true });
    // A whole new record: keys of the last product's groups must not stay behind, the quote would send them.
    setValue("options", defaultOptions(chosen, groups.data), { shouldDirty: true });
    setValue("size", "", { shouldDirty: true });
  }

  function chooseOption(key: string, value: string) {
    setValue("options", { ...getValues("options"), [key]: value }, { shouldDirty: true });
  }

  const optionReasons = refusals.get("options") ?? NO_REASONS;
  const sizeReasons = refusals.get("size") ?? NO_REASONS;
  const quantityReasons = refusals.get("quantity") ?? NO_REASONS;
  const sizeProblem = product && size !== "" ? sizeError(product.sizing, size) : null;
  const quantityProblem = quantityError(quantity);

  const sized = product !== undefined && product.sizing.mode !== "none";
  const speedChoice = speedList !== undefined && speedList.length > 1;

  // `contents`: its two blocks are cells of the page's customer grid, the product select beside the
  // customer from `sm:`, and the rest across the whole width under both.
  return (
    <div className="contents">
      <div className="flex min-w-0 flex-col gap-4">
        {products.isPending && <p className="text-sm text-ink-2">{COPY.product.loading}</p>}
        {products.isError && <LoadFailure error={products.error} fallback={COPY.product.loadFailed} onRetry={() => void products.refetch()} />}
        {products.data && products.data.length === 0 && <p className="text-sm text-ink-2">{COPY.product.none}</p>}
        {groups.isPending && <p className="text-sm text-ink-2">{COPY.product.optionsLoading}</p>}
        {groups.isError && <LoadFailure error={groups.error} fallback={COPY.product.optionsFailed} onRetry={() => void groups.refetch()} />}

        {products.data && products.data.length > 0 && (
          <FieldRow label={COPY.product.label}>
            {(props) => (
              <NativeSelect {...props} ref={productSelect} value={productId} disabled={!groups.data} onChange={(event) => chooseProduct(event.target.value)}>
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
      </div>

      {product && (
        <div className="flex min-w-0 flex-col gap-4 sm:col-span-2">
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

          {/* Size, quantity and speed in one row from `sm:`, each only when the product has it. */}
          <div className={cn("grid items-start gap-3.5", ROW[`${sized ? "size" : ""}-${speedChoice ? "speed" : ""}`])}>
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

            <QuantityField problems={quantityProblem ? [quantityProblem, ...quantityReasons] : quantityReasons} />

            {speedList && speedChoice && (
              <FieldRow label={COPY.product.speed}>
                {(props) => (
                  <NativeSelect {...props} value={speed} onChange={(event) => setValue("speed", event.target.value, { shouldDirty: true })}>
                    {speed === "" && (
                      <option value="" disabled>
                        {COPY.product.speedPlaceholder}
                      </option>
                    )}
                    {speedList.map((choice) => (
                      <option key={choice.key} value={choice.key}>
                        {`${choice.name} · ${COPY.product.workingDays(choice.working_days)}`}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FieldRow>
            )}
          </div>

          {speeds.isPending && <p className="text-sm text-ink-2">{COPY.product.speedsLoading}</p>}
          {speeds.isError && <LoadFailure error={speeds.error} fallback={COPY.product.speedsFailed} onRetry={() => void speeds.refetch()} />}
        </div>
      )}
    </div>
  );
}

/**
 * The size, quantity and speed row's columns from `sm:`, by which of size and speed the product has.
 * Quantity is 10rem, not narrower: its − and + are 44px each and it still shows 1,000,000.
 */
const ROW: Record<string, string> = {
  "size-speed": "sm:grid-cols-[1fr_10rem_1.3fr]",
  "size-": "sm:grid-cols-[1fr_10rem]",
  "-speed": "sm:grid-cols-[10rem_1fr]",
  "-": "sm:grid-cols-[10rem]",
};

/** The option group shown as tiles rather than pills, when it has no more than `RADIO_LIMIT` values. */
const TILED = "material";

/** The material as up to three tiles across from `sm:`, stacked below it; the checked one has a darker border. */
function MaterialTiles({
  field,
  value,
  onChoose,
  invalid,
  problems,
  canLeaveOut,
}: {
  field: OptionField;
  value: string;
  onChoose: (value: string) => void;
  invalid: boolean;
  problems: readonly string[];
  canLeaveOut: boolean;
}) {
  const choices = [...field.values.map((option) => ({ key: option.key, name: option.name })), ...(canLeaveOut ? [{ key: "", name: COPY.product.noChoice }] : [])];
  return (
    <FieldRow label={field.name} invalid={invalid} problems={problems} groupClassName="grid gap-2 sm:grid-cols-3">
      {choices.map((choice) => {
        const checked = choice.key === value;
        return (
          <label
            key={choice.key}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm font-medium has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-violet",
              checked ? "border-[1.5px] border-ink bg-panel-soft text-ink" : "border-line text-ink-2",
            )}
          >
            <input type="radio" name={`option-${field.key}`} value={choice.key} checked={checked} onChange={() => onChoose(choice.key)} className="size-4 accent-ink" />
            {choice.name}
          </label>
        );
      })}
    </FieldRow>
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
  if (field.key === TILED) {
    return <MaterialTiles field={field} value={value} onChoose={onChoose} invalid={invalid} problems={problems} canLeaveOut={canLeaveOut} />;
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
