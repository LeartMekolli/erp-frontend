import { describe, expect, it } from "vitest";

import type { FileMeasure } from "@/lib/upload/upload";

import { fileSize, modelMeasures } from "./model";

const measure = (type: string, value: string, unit: string): FileMeasure => ({ type, value, unit });

const ALL: FileMeasure[] = [
  measure("volume", "1240", "mm3"),
  measure("surface_area", "1860", "mm2"),
  measure("bounding_box_x", "22", "mm"),
  measure("bounding_box_y", "18", "mm"),
  measure("bounding_box_z", "4", "mm"),
];

describe("modelMeasures", () => {
  it("formats volume, size and surface", () => {
    expect(modelMeasures(ALL)).toEqual({ volume: "1,240 mm³", size: "22 × 18 × 4 mm", surface: "1,860 mm²" });
  });

  it("leaves out size without all three sides", () => {
    const withoutZ = ALL.filter((m) => m.type !== "bounding_box_z");
    expect(modelMeasures(withoutZ)).toEqual({ volume: "1,240 mm³", size: null, surface: "1,860 mm²" });
    expect(modelMeasures([])).toEqual({ volume: null, size: null, surface: null });
  });

  it("rounds to one decimal", () => {
    expect(modelMeasures([measure("volume", "12.345", "mm3")]).volume).toBe("12.3 mm³");
  });
});

describe("fileSize", () => {
  it("says megabytes with one decimal", () => {
    expect(fileSize(Math.round(2.4 * 1024 * 1024))).toBe("2.4 MB");
  });

  it("says kilobytes as whole numbers", () => {
    expect(fileSize(820 * 1024)).toBe("820 KB");
  });

  it("says bytes below a kilobyte", () => {
    expect(fileSize(12)).toBe("12 bytes");
  });
});
