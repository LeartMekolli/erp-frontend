import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_VALUES, type NewOrderValues } from "@/lib/new-order/form";
import type { UploadPhase } from "@/lib/upload/use-upload";

import { ORDER_TAKER, STAFF } from "../../../test/fake-erp-api/seed";
import { renderAs } from "../../../test/render";

import { ModelField, readyVersionId, type ModelUpload } from "./model-field";

/** An upload in `phase`, so the field can be seen in each state without sending a file. */
function stub(phase: UploadPhase, upload = vi.fn()): ModelUpload {
  return {
    upload,
    retry: vi.fn(),
    reset: vi.fn(),
    phase,
    progress: phase === "idle" ? 0 : 1,
    fileId: phase === "idle" ? undefined : "file-1",
    versionId: phase === "idle" ? undefined : "version-1",
    slow: false,
    offline: false,
    message: null,
  };
}

function Harness({ upload }: { upload: ModelUpload }) {
  const form = useForm<NewOrderValues>({ defaultValues: EMPTY_VALUES });
  return (
    <FormProvider {...form}>
      <ModelField upload={upload} />
    </FormProvider>
  );
}

describe("ModelField", () => {
  it("says why without file.write", async () => {
    renderAs(ORDER_TAKER, <Harness upload={stub("idle")} />);
    expect(await screen.findByText("You can't upload the model. Ask an admin for file access.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload a model")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drawn in")).not.toBeInTheDocument();
  });

  it("asks the unit before the file", async () => {
    renderAs(STAFF, <Harness upload={stub("idle")} />);
    const unit = await screen.findByRole("combobox", { name: "Drawn in" });
    expect(unit).toHaveValue("mm");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Millimetres", "Centimetres", "Metres", "Inches"]);
    await userEvent.selectOptions(unit, "Inches");
    expect(unit).toHaveValue("in");
    expect(unit.compareDocumentPosition(screen.getByLabelText("Upload a model")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("starts the upload with the chosen file", async () => {
    const start = vi.fn();
    renderAs(STAFF, <Harness upload={stub("idle", start)} />);
    const file = new File(["solid ring"], "ring.stl", { type: "model/stl" });
    await userEvent.upload(await screen.findByLabelText("Upload a model"), file);
    expect(start).toHaveBeenCalledWith(file);
  });

  it("offers to replace the model once it is ready", async () => {
    renderAs(STAFF, <Harness upload={stub("done")} />);
    expect(await screen.findByLabelText("Replace the model")).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload a model")).not.toBeInTheDocument();
  });

  it("changing the unit drops the uploaded model", async () => {
    const done = stub("done");
    renderAs(STAFF, <Harness upload={done} />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Drawn in" }), "Metres");
    expect(done.reset).toHaveBeenCalledTimes(1);
  });

  it("changing the unit before any upload resets nothing", async () => {
    const idle = stub("idle");
    renderAs(STAFF, <Harness upload={idle} />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Drawn in" }), "Metres");
    expect(idle.reset).not.toHaveBeenCalled();
  });

  it("hands over the version id only when the model is ready", () => {
    expect(readyVersionId(stub("done"))).toBe("version-1");
    expect(readyVersionId(stub("measuring"))).toBeUndefined();
    expect(readyVersionId(stub("failed"))).toBeUndefined();
    expect(readyVersionId(stub("idle"))).toBeUndefined();
  });
});
