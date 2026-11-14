"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";

import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";
import type { MoveBody } from "@/lib/api/schema-types";
import { emptyMoveValues, fieldPath, moveBody, moveSchema, type MoveKind, type MoveValues } from "@/lib/production/move-body";
import type { NextStep, Piece, StepRules } from "@/lib/production/shape";
import type { UploadTarget } from "@/lib/upload/upload";

import { ChecklistFields } from "./checklist-fields";
import { DIALOG_SHEET } from "./dialog-classes";
import { PhotoField, usePhotos } from "./evidence-fields";
import { passLabel } from "./move-bar";
import { submitErrorText } from "./submit-error";

interface MoveDialogProps {
  kind: MoveKind;
  rules: StepRules;
  /** The steps a correction can put pieces at. */
  path: { key: string; name: string }[];
  next: NextStep;
  pieces: Piece[];
  /** Whether this person may add photos. */
  mayUpload: boolean;
  uploadTarget: UploadTarget;
  /** Set when the move counts for the partner holding the line. */
  countsFor: string | null;
  /** Sends the move; throws erp-api's refusal. */
  onMove: (body: MoveBody) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: (message: string) => void;
}

const nounFor = (count: number) => `${count} ${count === 1 ? "piece" : "pieces"}`;

/** Pass, fail or correct the picked pieces, with whatever the step asks for. Opens as a bottom sheet on phones. */
export function MoveDialog({ open, onOpenChange, ...form }: MoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHEET}>
        <MoveForm
          {...form}
          onDone={(message) => {
            onOpenChange(false);
            form.onMoved(message);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function OutcomeText({ defect, step, path }: { defect: StepRules["defects"][number]; step: StepRules; path: MoveDialogProps["path"] }) {
  if (defect.outcome === "scrap") return "The pieces are scrapped";
  if (defect.outcome === "continue") return "The pieces carry on to the next step";
  const named = [...step.reworkTargets, ...path].find((target) => target.key === defect.reworkTo);
  return `Goes back to ${named?.name ?? defect.reworkTo} to be redone`;
}

function MoveForm({
  kind,
  rules: step,
  path,
  next,
  pieces,
  mayUpload,
  uploadTarget,
  countsFor,
  onMove,
  onDone,
}: Omit<MoveDialogProps, "open" | "onOpenChange" | "onMoved"> & { onDone: (message: string) => void }) {
  const photos = usePhotos(uploadTarget);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<MoveValues>({ resolver: zodResolver(moveSchema(kind, step, photos.list.length)), defaultValues: emptyMoveValues(step) });
  const [defectId, changing, outcome] = useWatch({ control, name: ["defectId", "changing", "outcome"] });

  const noun = nounFor(pieces.length);
  const ids = pieces.map((piece) => piece.id);
  const evidence = kind === "pass" ? step.pass : kind === "fail" ? step.fail : null;
  const defect = step.defects.find((d) => d.id === defectId);
  const canSkip = kind === "pass" && pieces.every((piece) => piece.toInspect === false);
  const photosBlocked = evidence !== null && evidence.minPhotos > 0 && !mayUpload;
  const noDefects = kind === "fail" && step.defects.length === 0;

  const title = { pass: `${next === null ? "Finish" : "Pass"} ${noun} at ${step.name}`, fail: `Fail ${noun} at ${step.name}`, correction: `Correct ${noun} at ${step.name}` }[kind];
  const done = {
    pass: next === "unknown" ? `${noun} passed at ${step.name}.` : next ? `${noun} passed to ${next.name}.` : `${noun} finished.`,
    fail: `${noun} failed at ${step.name}.`,
    correction: `${noun} corrected.`,
  }[kind];
  const fields = [
    ...step.checklist.map((item) => `answers.${item.key}` as Path<MoveValues>),
    "comment",
    "photoVersionIds",
    "defectId",
    "overrideReason",
    "reworkTo",
    "toStep",
  ] as Path<MoveValues>[];

  async function send(body: MoveBody) {
    setMessage(null);
    setSending(true);
    try {
      await onMove(body);
    } catch (error) {
      if (isApiProblem(error) && error.status === 400) {
        const named = { ...error, errors: error.errors?.map((e) => ({ ...e, path: fieldPath(e.path, step) })) };
        setMessage(applyFieldErrors(named, setError, fields));
      } else setMessage(submitErrorText(error));
      return;
    } finally {
      setSending(false);
    }
    onDone(done);
  }

  const onSubmit = (values: MoveValues) => send(moveBody(kind, step, ids, { ...values, photoVersionIds: photos.list.map((photo) => photo.versionId) }));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm break-words text-ink-2 tabular-nums">{pieces.map((piece) => piece.label).join(", ")}</DialogDescription>
        {countsFor && <p className="text-caption font-medium text-ink">{`This counts for ${countsFor}`}</p>}
      </div>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
        {message && <FormMessage tone="error">{message}</FormMessage>}
        {photosBlocked && <FormMessage tone="error">This step needs photos, and you don&apos;t have permission to add them.</FormMessage>}
        {noDefects && <FormMessage tone="error">This step has no defects set up, so pieces can&apos;t be failed here.</FormMessage>}
        <fieldset disabled={sending} className="flex flex-col gap-4">
          {kind === "pass" && <ChecklistFields checklist={step.checklist} register={register} errors={errors} />}

          {kind === "fail" && !noDefects && (
            <>
              <Field id="move-defect" label="Defect" error={errors.defectId?.message}>
                {(props) => (
                  <NativeSelect {...props} {...register("defectId", { onChange: () => setValue("changing", false) })}>
                    <option value="">Choose a defect</option>
                    {step.defects.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              {defect && !changing && (
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <p className="text-sm text-ink">
                    <OutcomeText defect={defect} step={step} path={path} />
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => {
                      setValue("outcome", defect.outcome);
                      setValue("reworkTo", defect.reworkTo ?? "");
                      setValue("changing", true);
                    }}
                  >
                    Change what happens
                  </Button>
                </div>
              )}
              {defect && changing && (
                <>
                  <Field id="move-outcome" label="What should happen">
                    {(props) => (
                      <NativeSelect {...props} {...register("outcome")}>
                        {step.reworkTargets.length > 0 && <option value="rework">Send them back to be redone</option>}
                        <option value="scrap">Scrap the pieces</option>
                        <option value="continue">Let them carry on</option>
                      </NativeSelect>
                    )}
                  </Field>
                  {outcome === "rework" && (
                    <Field id="move-rework-to" label="Send them back to" error={errors.reworkTo?.message}>
                      {(props) => (
                        <NativeSelect {...props} {...register("reworkTo")}>
                          {step.reworkTargets.map((target) => (
                            <option key={target.key} value={target.key}>
                              {target.name}
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                    </Field>
                  )}
                  <Field id="move-reason" label="Reason" error={errors.overrideReason?.message}>
                    {(props) => <Textarea {...props} {...register("overrideReason")} />}
                  </Field>
                </>
              )}
            </>
          )}

          {kind === "correction" && (
            <Field id="move-to-step" label="Put them at" error={errors.toStep?.message}>
              {(props) => (
                <NativeSelect {...props} {...register("toStep")}>
                  <option value="">Choose a step</option>
                  {path
                    .filter((s) => s.key !== step.key)
                    .map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                </NativeSelect>
              )}
            </Field>
          )}

          {evidence !== null && evidence.minPhotos > 0 && mayUpload && (
            <PhotoField photos={photos} min={evidence.minPhotos} error={errors.photoVersionIds?.message} onAdded={() => clearErrors("photoVersionIds")} />
          )}

          {(kind === "correction" || evidence?.commentRequired) && (
            <Field id="move-comment" label="Comment" error={errors.comment?.message}>
              {(props) => <Textarea {...props} {...register("comment")} />}
            </Field>
          )}

          <div className="mt-1 flex flex-wrap justify-end gap-2">
            {canSkip && (
              <Button type="button" variant="outline" onClick={() => void send(moveBody("pass", step, ids, { ...getValues(), inspected: false }))}>
                Pass without inspecting
              </Button>
            )}
            <Button type="submit" disabled={photos.busy || photosBlocked || noDefects}>
              {kind === "pass" ? passLabel(next) : kind === "fail" ? "Fail" : "Correct"}
            </Button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
