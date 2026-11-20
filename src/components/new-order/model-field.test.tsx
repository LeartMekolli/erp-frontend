import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { CatalogProduct } from "@/lib/api/schema-types";
import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import type { FileMeasure } from "@/lib/upload/upload";
import type { UploadPhase } from "@/lib/upload/use-upload";

import { ORDER_TAKER, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { ModelCard } from "./model-field";
import { useModel, type ModelUpload } from "./use-model";

const MEASURES: FileMeasure[] = [
  { type: "volume", value: "1240", unit: "mm3" },
  { type: "surface_area", value: "1860", unit: "mm2" },
  { type: "bounding_box_x", value: "22", unit: "mm" },
  { type: "bounding_box_y", value: "18", unit: "mm" },
  { type: "bounding_box_z", value: "4", unit: "mm" },
];

/** An upload in `phase`, so the card can be seen in each state without sending a file. */
function stub(phase: UploadPhase): ModelUpload {
  return {
    upload: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
    phase,
    progress: phase === "idle" ? 0 : 1,
    fileId: phase === "idle" ? undefined : "file-1",
    versionId: phase === "idle" ? undefined : "version-1",
    file: null,
    startedFor: undefined,
    measures: phase === "done" ? MEASURES : [],
    slow: false,
    offline: false,
    message: null,
  };
}

const ring = () => new File(["solid ring"], "ring.stl", { type: "model/stl" });
const CUSTOM = { kind: "custom" } satisfies Pick<CatalogProduct, "kind">;
const NAMEPLATE = { kind: "ready_made" } satisfies Pick<CatalogProduct, "kind">;

type CardModel = Parameters<typeof ModelCard>[0]["model"];

/** What `useModel` hands the card, with a file held and its upload in `phase` unless `over` says otherwise. */
function modelIn(phase: UploadPhase, over: Partial<CardModel> = {}): CardModel {
  return {
    held: phase === "idle" ? null : ring(),
    upload: stub(phase),
    readyVersionId: phase === "done" ? "version-1" : undefined,
    waitingForCustomer: false,
    canUpload: true,
    choose: vi.fn(),
    remove: vi.fn(),
    ...over,
  };
}

function Harness({ model, product }: { model: CardModel; product?: Pick<CatalogProduct, "kind"> }) {
  const form = useForm<NewOrderValues>({ defaultValues: EMPTY_VALUES });
  return (
    <FormProvider {...form}>
      <ModelCard model={model} product={product} />
    </FormProvider>
  );
}

/** The real `useModel`, so a dropped file is held the way the page holds it. */
function HookHarness({ customerId }: { customerId: string }) {
  const model = useModel({ customerId, declaredUnit: "mm" });
  return <Harness model={model} />;
}

describe("ModelCard", () => {
  it("says why without file.write", async () => {
    renderAs(ORDER_TAKER, <Harness model={modelIn("idle", { canUpload: false })} />);
    expect(await screen.findByText("You can't upload the model. Ask an admin for file access.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload a model")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Drawn in" })).not.toBeInTheDocument();
  });

  it("takes a dropped file before the customer", async () => {
    renderAs(STAFF, <HookHarness customerId="" />);
    const zone = (await screen.findByText("Drop the model here, or choose a file")).closest("label");
    expect(zone).not.toBeNull();
    fireEvent.drop(zone!, { dataTransfer: { files: [ring()] } });
    expect(await screen.findByText("ring.stl")).toBeInTheDocument();
    expect(screen.getByText("Uploads when you pick the customer.")).toBeInTheDocument();
    expect(screen.queryByText("Drop the model here, or choose a file")).not.toBeInTheDocument();
  });

  it("hands a file picked by the input to the model", async () => {
    const model = modelIn("idle");
    renderAs(STAFF, <Harness model={model} />);
    await userEvent.upload(await screen.findByLabelText("Upload a model"), ring());
    expect(model.choose).toHaveBeenCalledWith(expect.objectContaining({ name: "ring.stl" }));
  });

  it("shows the file name after upload, not 'No file chosen'", async () => {
    renderAs(STAFF, <Harness model={modelIn("done")} product={CUSTOM} />);
    expect(await screen.findByText("ring.stl")).toBeInTheDocument();
    expect(screen.getByText("10 bytes")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText(/no file chosen/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Replace file")).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload a model")).not.toBeInTheDocument();
  });

  it("shows volume, size and surface once measured", async () => {
    renderAs(STAFF, <Harness model={modelIn("done")} product={CUSTOM} />);
    expect(await screen.findByText("1,240 mm³")).toBeInTheDocument();
    expect(screen.getByText("22 × 18 × 4 mm")).toBeInTheDocument();
    expect(screen.getByText("1,860 mm²")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("Size (W × D × H)")).toBeInTheDocument();
    expect(screen.getByText("Surface")).toBeInTheDocument();
  });

  it("shows no measures before the model is ready", async () => {
    renderAs(STAFF, <Harness model={modelIn("measuring")} product={CUSTOM} />);
    expect(await screen.findByText("Measuring…")).toBeInTheDocument();
    expect(screen.queryByText("Volume")).not.toBeInTheDocument();
  });

  it("says the product doesn't use a model", async () => {
    renderAs(STAFF, <Harness model={modelIn("done")} product={NAMEPLATE} />);
    expect(await screen.findByText("ring.stl")).toBeInTheDocument();
    expect(screen.getByText("This product doesn't use a model.")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Volume")).not.toBeInTheDocument();
  });

  it("switches the unit with the keyboard", async () => {
    renderAs(STAFF, <Harness model={modelIn("done")} product={CUSTOM} />);
    const group = await screen.findByRole("radiogroup", { name: "Drawn in" });
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["mm", "cm", "m", "in"]);
    expect(screen.getByRole("radio", { name: "mm" })).toBeChecked();
    expect(group).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "mm" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "cm" })).toBeChecked();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("radio", { name: "in" })).toBeChecked();
  });

  it("removes the file", async () => {
    const model = modelIn("done");
    renderAs(STAFF, <Harness model={model} product={CUSTOM} />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(model.remove).toHaveBeenCalled();
  });

  it("shows the failure and a way to try again", async () => {
    const model = modelIn("failed");
    renderAs(STAFF, <Harness model={model} product={CUSTOM} />);
    expect(await screen.findByText("Upload failed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(model.upload.retry).toHaveBeenCalled();
  });
});
