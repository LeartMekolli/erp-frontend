"use client";

import { useState } from "react";

import { Field } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PHOTO_CONTENT_TYPES, type UploadTarget } from "@/lib/upload/upload";
import { useUpload } from "@/lib/upload/use-upload";

const TARGET: UploadTarget = { area: "staff", kind: "image" };

/** erp-api's limit (`moves.service.ts:25`). */
const MAX_PHOTOS = 20;

interface Photo {
  versionId: string;
  name: string;
}

/**
 * The photos of one move, uploaded one at a time. A move can attach a photo as
 * soon as its bytes are in, without waiting for measuring (`moves.service.ts:28`).
 */
export function usePhotos() {
  const current = useUpload(TARGET);
  const [earlier, setEarlier] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const attachable = (current.phase === "measuring" || current.phase === "done") && current.versionId !== undefined;
  const latest: Photo[] = attachable ? [{ versionId: current.versionId!, name }] : [];
  const list = [...earlier, ...latest];

  return {
    list,
    name,
    phase: current.phase,
    message: current.message,
    busy: current.phase === "uploading" || current.phase === "completing",
    retry: current.retry,
    add(file: File) {
      setEarlier(list);
      setName(file.name);
      current.upload(file);
    },
    remove(versionId: string) {
      if (current.versionId === versionId) current.reset();
      else setEarlier((photos) => photos.filter((photo) => photo.versionId !== versionId));
    },
  };
}

type Photos = ReturnType<typeof usePhotos>;

/** The photos a step asks for: what has been added, and a way to add more. */
export function PhotoField({ photos, min, error, onAdded }: { photos: Photos; min: number; error?: string; onAdded: () => void }) {
  const failed = photos.phase === "failed" || photos.phase === "expired";
  return (
    <div className="flex flex-col gap-2">
      <Field id="move-photos" label="Photos" hint={`At least ${min}. JPEG, PNG or WebP.`} error={error}>
        {(props) => (
          <Input
            {...props}
            type="file"
            accept={PHOTO_CONTENT_TYPES.join(",")}
            disabled={photos.busy || photos.list.length >= MAX_PHOTOS}
            className="py-2.5"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              photos.add(file);
              onAdded();
            }}
          />
        )}
      </Field>
      {photos.list.length > 0 && (
        <ul className="flex flex-col">
          {photos.list.map((photo) => (
            <li key={photo.versionId} className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-all">{photo.name}</span>
              <Button type="button" variant="link" aria-label={`Remove ${photo.name}`} onClick={() => photos.remove(photo.versionId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="text-caption text-ink-2 empty:hidden">
        {photos.busy && `Uploading ${photos.name}…`}
      </p>
      {failed && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-caption text-late">{photos.phase === "expired" ? "The upload link ran out." : (photos.message ?? `${photos.name} couldn't be uploaded.`)}</p>
          <Button type="button" variant="link" onClick={photos.retry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
