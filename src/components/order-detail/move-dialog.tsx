"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";

import { UNKNOWN, noAnswer } from "@/components/auth/copy";
import { Field } from "@/components/auth/field";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { applyFieldErrors, isApiProblem } from "@/lib/api/problem";
import type { Group, MoveBody, WorkflowStep, WorkOrderListItem } from "@/lib/api/schema-types";
import { useCan } from "@/lib/auth/permissions";
import { emptyMoveValues, fieldPath, moveBody, moveSchema, type MoveKind, type MoveValues } from "@/lib/production/move-body";
import { useMovePieces } from "@/lib/production/queries";
import { nextStepName } from "@/lib/production/selection";
import { OfflineError } from "@/lib/session/client-session";

import { ChecklistFields } from "./checklist-fields";
import { PhotoField, usePhotos } from "./evidence-fields";

interface MoveDialogProps {
  kind: MoveKind;
  step: WorkflowStep;
  path: Group["steps"];
  pieces: WorkOrderListItem[];
  /** Set when the move counts for the partner holding the line. */
  partnerName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: (message: string) => void;
}

/** How many problems of a 409 to name: a move can hold a thousand pieces. */
const NAMED_CONFLICTS = 3;

const nounFor = (count: number) => `${count} ${count === 1 ? "piece" : "pieces"}`;

/** Pass, fail or correct the picked pieces, with whatever the step asks for. Opens as a bottom sheet on phones. */
export function MoveDialog({ open, onOpenChange, ...form }: MoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] gap-5 overflow-y-auto p-5 sm:max-w-md max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
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

function OutcomeText({ defect, path }: { defect: WorkflowStep["defects"][number]; path: Group["steps"] }) {
  if (defect.outcome === "scrap") return "The pieces are scrapped";
  if (defect.outcome === "continue") return "The pieces carry on to the next step";
  return `Goes back to ${path.find((step) => step.key === defect.rework_to)?.name ?? defect.rework_to} to be redone`;
}

function MoveForm({ kind, step, path, pieces, partnerName, onDone }: Omit<MoveDialogProps, "open" | "onOpenChange"> & { onDone: (message: string) => void }) {
  const mayUpload = useCan("file.write");
  const photos = usePhotos();
  const move = useMovePieces();
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
  const next = nextStepName(path, step.key);
  const passLabel = next ? `Pass to ${next}` : "Finish";
  const evidence = kind === "pass" ? step.pass : kind === "fail" ? step.fail : null;
  const defect = step.defects.find((d) => d.defect_id === defectId);
  const canSkip = kind === "pass" && pieces.every((piece) => piece.to_inspect === false);
  const photosBlocked = evidence !== null && evidence.min_photos > 0 && !mayUpload;
  const noDefects = kind === "fail" && step.defects.length === 0;

  const title = { pass: `${next ? "Pass" : "Finish"} ${noun} at ${step.name}`, fail: `Fail ${noun} at ${step.name}`, correction: `Correct ${noun} at ${step.name}` }[kind];
  const done = {
    pass: next ? `${noun} passed to ${next}.` : `${noun} finished.`,
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
    try {
      await move.mutateAsync(body);
    } catch (error) {
      if (error instanceof OfflineError) setMessage(noAnswer());
      else if (isApiProblem(error) && error.status === 400) {
        const named = { ...error, errors: error.errors?.map((e) => ({ ...e, path: fieldPath(e.path, step) })) };
        setMessage(applyFieldErrors(named, setError, fields));
      } else if (isApiProblem(error)) {
        setMessage([error.detail, ...(error.errors ?? []).slice(0, NAMED_CONFLICTS).map((e) => e.message)].filter(Boolean).join(" ") || UNKNOWN);
      } else setMessage(UNKNOWN);
      return;
    }
    onDone(done);
  }

  const onSubmit = (values: MoveValues) => send(moveBody(kind, step, ids, { ...values, photoVersionIds: photos.list.map((photo) => photo.versionId) }));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm break-words text-ink-2 tabular-nums">{pieces.map((piece) => piece.label).join(", ")}</DialogDescription>
        {partnerName && <p className="text-caption font-medium text-ink">{`This counts for ${partnerName}`}</p>}
      </div>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-5">
        {message && <FormMessage tone="error">{message}</FormMessage>}
        {photosBlocked && <FormMessage tone="error">This step needs photos, and you don&apos;t have permission to add them.</FormMessage>}
        {noDefects && <FormMessage tone="error">This step has no defects set up, so pieces can&apos;t be failed here.</FormMessage>}
        <fieldset disabled={move.isPending} className="flex flex-col gap-4">
          {kind === "pass" && <ChecklistFields checklist={step.checklist} register={register} errors={errors} />}

          {kind === "fail" && !noDefects && (
            <>
              <Field id="move-defect" label="Defect" error={errors.defectId?.message}>
                {(props) => (
                  <NativeSelect {...props} {...register("defectId", { onChange: () => setValue("changing", false) })}>
                    <option value="">Choose a defect</option>
                    {step.defects.map((d) => (
                      <option key={d.defect_id} value={d.defect_id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              {defect && !changing && (
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <p className="text-sm text-ink">
                    <OutcomeText defect={defect} path={path} />
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => {
                      setValue("outcome", defect.outcome);
                      setValue("reworkTo", defect.rework_to ?? "");
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
                        {step.rework_targets.length > 0 && <option value="rework">Send them back to be redone</option>}
                        <option value="scrap">Scrap the pieces</option>
                        <option value="continue">Let them carry on</option>
                      </NativeSelect>
                    )}
                  </Field>
                  {outcome === "rework" && (
                    <Field id="move-rework-to" label="Send them back to" error={errors.reworkTo?.message}>
                      {(props) => (
                        <NativeSelect {...props} {...register("reworkTo")}>
                          {step.rework_targets.map((key) => (
                            <option key={key} value={key}>
                              {path.find((s) => s.key === key)?.name ?? key}
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

          {evidence !== null && evidence.min_photos > 0 && mayUpload && (
            <PhotoField photos={photos} min={evidence.min_photos} error={errors.photoVersionIds?.message} onAdded={() => clearErrors("photoVersionIds")} />
          )}

          {(kind === "correction" || evidence?.comment_required) && (
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
              {kind === "pass" ? passLabel : kind === "fail" ? "Fail" : "Correct"}
            </Button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
