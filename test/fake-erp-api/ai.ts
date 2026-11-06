/**
 * The fake erp-api's questions to the AI (erp-api `src/modules/ai/runs.controller.ts`):
 * `POST /ai/ask` queues a run and answers its id; `GET /ai/runs/{id}` is
 * pending on the first read, then done, or failed for a question containing
 * "fail". Someone else's run is a 404.
 */

import type { AiRun } from "../../src/lib/api/schema-types";

import type { Answer } from "./orders";
import { CUSTOMERS } from "./orders-seed";

const ORDER_1041 = "22222222-0000-4000-8000-000000001041";
const FINISHING_STEP = "77777777-0000-4000-8000-000000000001";

function answerTo(question: string): NonNullable<AiRun["answer"]> {
  if (question.includes("html")) return { text: "<b>Not bold</b>", refs: [], action: null };
  return {
    text: "Order #1041 is 2 days late: 3 pieces are back in finishing.\nFieldnote Studio was told on Monday.",
    refs: [
      { type: "order", id: ORDER_1041, label: "#1041" },
      { type: "step", id: FINISHING_STEP, label: "Finishing" },
    ],
    action: { kind: "contact_customer", targets: [{ type: "customer", id: CUSTOMERS.fieldnote.id, label: "Fieldnote Studio" }] },
  };
}

export function createAiStore(now: () => number) {
  const runs = new Map<string, { userId: string; question: string; reads: number; run: AiRun }>();
  let available = true;

  return {
    ask(userId: string, question: string): Answer<{ id: string }> {
      const trimmed = question.trim();
      if (trimmed.length < 1 || trimmed.length > 500)
        return { ok: false, status: 400, errors: [{ path: "question", message: "must be 1 to 500 characters" }] };
      if (!available) return { ok: false, status: 409, detail: "AI is not set up for this workspace" };
      const id = crypto.randomUUID();
      runs.set(id, {
        userId,
        question: trimmed,
        reads: 0,
        run: { id, kind: "ask", status: "pending", answer: null, error: null, created_at: new Date(now()).toISOString(), finished_at: null },
      });
      return { ok: true, body: { id } };
    },

    run(userId: string, id: string): Answer<AiRun> {
      const stored = runs.get(id);
      if (!stored || stored.userId !== userId) return { ok: false, status: 404, detail: "AI run not found" };
      stored.reads += 1;
      if (stored.reads > 1 && stored.run.status === "pending") {
        const finishedAt = new Date(now()).toISOString();
        stored.run = stored.question.includes("fail")
          ? { ...stored.run, status: "failed", error: "The AI couldn't answer this time.", finished_at: finishedAt }
          : { ...stored.run, status: "done", answer: answerTo(stored.question), finished_at: finishedAt };
      }
      return { ok: true, body: structuredClone(stored.run) };
    },

    /** Whether the workspace has an AI limit set; without one, asking is a 409. */
    setAvailable(on: boolean): void {
      available = on;
    },
  };
}
