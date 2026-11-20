import { LOCALE } from "@/lib/format/money";
import type { FileMeasure } from "@/lib/upload/upload";

const ONE_DECIMAL = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** Units as erp-api names them (`measurers.ts`), written the way people read them. */
const UNIT_LABEL: Record<string, string> = { mm3: "mm³", mm2: "mm²" };

function find(measures: readonly FileMeasure[], type: string): { value: number; unit: string } | null {
  const measure = measures.find((m) => m.type === type);
  if (!measure) return null;
  const value = Number(measure.value);
  return Number.isFinite(value) ? { value, unit: UNIT_LABEL[measure.unit] ?? measure.unit } : null;
}

function withUnit(measure: { value: number; unit: string } | null): string | null {
  return measure && `${ONE_DECIMAL.format(measure.value)} ${measure.unit}`;
}

/**
 * What the server measured on a model, ready to show. `Number()` is fine:
 * measures aren't money. Size needs all three sides.
 */
export function modelMeasures(measures: readonly FileMeasure[]): {
  volume: string | null;
  size: string | null;
  surface: string | null;
} {
  const x = find(measures, "bounding_box_x");
  const y = find(measures, "bounding_box_y");
  const z = find(measures, "bounding_box_z");
  return {
    volume: withUnit(find(measures, "volume")),
    size: x && y && z ? `${[x, y, z].map((side) => ONE_DECIMAL.format(side.value)).join(" × ")} ${x.unit}` : null,
    surface: withUnit(find(measures, "surface_area")),
  };
}

/** A file's size the way a person says it: "2.4 MB", "820 KB", "12 bytes". */
export function fileSize(bytes: number): string {
  const kilobytes = Math.round(bytes / 1024);
  // 1,048,000 bytes rounds to 1,024 KB: that reads as 1 MB.
  if (bytes >= 1024 * 1024 || kilobytes >= 1024) return `${ONE_DECIMAL.format(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${kilobytes.toLocaleString(LOCALE)} KB`;
  return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
}
