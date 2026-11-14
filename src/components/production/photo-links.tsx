"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import type { Photo } from "@/lib/production/shape";

/** erp-api's photo links last five minutes (`files.service.ts:29`); each is renewed before then. */
const RENEW_MS = 4 * 60_000;

interface PhotoLinks {
  link: (photo: Photo) => Promise<string>;
  /** Whether this person may see photos, or only how many there are. */
  mayView: boolean;
}

const PhotoLinksContext = createContext<PhotoLinks | null>(null);

/**
 * How QC photos open, for everything below: staff's come from the file, a partner's through its move.
 * Photos sit deep in Quality, History and the piece panel, so they read this instead of a prop at every level.
 */
export function PhotoLinksProvider({ link, mayView, children }: PhotoLinks & { children: ReactNode }) {
  return <PhotoLinksContext value={{ link, mayView }}>{children}</PhotoLinksContext>;
}

export function usePhotoLinks(): PhotoLinks {
  const links = useContext(PhotoLinksContext);
  if (!links) throw new Error("usePhotoLinks needs a PhotoLinksProvider");
  return links;
}

/** A photo's link, renewed while it's on screen. */
export function usePhotoLink(photo: Photo) {
  const { link } = usePhotoLinks();
  return useQuery({
    queryKey: ["production", "photo", photo.fileVersionId],
    queryFn: () => link(photo),
    staleTime: RENEW_MS,
    refetchInterval: RENEW_MS,
  });
}
