import { render } from "@testing-library/react";

import { useArrivalNote, type ArrivalNote } from "../src/lib/navigation/arrival-note";

/** The note waiting for the page at `path`, taken as that page would take it, so it's used up. */
export function takeArrivalNote(path: string): ArrivalNote | null {
  let taken: ArrivalNote | null = null;
  function Page() {
    useArrivalNote(path, (note) => {
      taken = note;
    });
    return null;
  }
  render(<Page />).unmount();
  return taken;
}
