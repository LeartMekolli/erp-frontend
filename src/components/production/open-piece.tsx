"use client";

import { createContext, use, useState, type ReactNode } from "react";

type OpenPiece = { id: string | null; open: (id: string) => void; close: () => void };

const OpenPieceContext = createContext<OpenPiece | null>(null);

/**
 * Which piece's story is open on this page. It's kept on the page, never in the address, so a reload
 * opens the page with no piece open (CLAUDE.md § Addresses). Key it by the order or job, so moving to
 * another one never keeps a piece open.
 */
export function OpenPieceProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return <OpenPieceContext value={{ id, open: setId, close: () => setId(null) }}>{children}</OpenPieceContext>;
}

/** The open piece, and opening or closing one. Only inside an `OpenPieceProvider`. */
export function useOpenPiece(): OpenPiece {
  const value = use(OpenPieceContext);
  if (!value) throw new Error("useOpenPiece needs an OpenPieceProvider around the page");
  return value;
}
