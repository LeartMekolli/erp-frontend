"use client";

import { Fragment, useState } from "react";

import { UNKNOWN } from "@/components/auth/copy";
import { useCan } from "@/lib/auth/permissions";
import { isApiProblem } from "@/lib/api/problem";
import type { OrderPart } from "@/lib/api/schema-types";
import { openFile } from "@/lib/files/download";

const sizeText = (size: NonNullable<OrderPart["size"]>) => ("scale" in size ? `Scale ${size.scale}` : size.named);

/** What a line or part was made with: its options, its size and its design file. */
export function LinePicks({ line }: { line: Pick<OrderPart, "options" | "size" | "design_file"> }) {
  const mayDownload = useCan("file.read");
  const [failure, setFailure] = useState<string | null>(null);
  const file = line.design_file;

  const picks = [
    ...line.options.map((option) => <span key={option.group.key}>{option.value.name}</span>),
    ...(line.size ? [<span key="size">{sizeText(line.size)}</span>] : []),
    ...(file
      ? [
          mayDownload ? (
            <button
              key="file"
              type="button"
              className="break-all underline underline-offset-2 hover:text-ink"
              onClick={() => {
                setFailure(null);
                openFile(file.file_id, file.file_version_id).catch((error: unknown) =>
                  setFailure((isApiProblem(error) && error.detail) || UNKNOWN),
                );
              }}
            >
              {file.name}
            </button>
          ) : (
            <span key="file" className="break-all">
              {file.name}
            </span>
          ),
        ]
      : []),
  ];
  if (picks.length === 0) return null;

  return (
    <>
      <p className="flex flex-wrap gap-x-1.5 text-sm break-words text-ink-2">
        {picks.map((pick, index) => (
          <Fragment key={pick.key}>
            {index > 0 && <span aria-hidden>·</span>}
            {pick}
          </Fragment>
        ))}
      </p>
      {failure && (
        <p role="alert" className="text-caption font-medium text-ink">
          {failure}
        </p>
      )}
    </>
  );
}
