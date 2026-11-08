/**
 * The fake erp-api's order comments and claims. It keeps the rules the order
 * page depends on (erp-api `src/modules/orders/comments.service.ts`): comments
 * oldest first, a comment for the partner needs a line, and a line must be on
 * the order.
 */

import type { Claim, OrderComment, StaffCommentBody } from "../../src/lib/api/schema-types";

import type { Answer, OrdersStore, Page } from "./orders";
import { uuid } from "./orders-seed";

const HOUR = 3_600_000;
const COMMENT_MAX_LENGTH = 5000;
const FILE_VERSION = uuid("d0d0d0d0", 1);

const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

function paged<T>(all: T[], params: URLSearchParams): Answer<Page<T>> {
  const limit = Number(params.get("limit") ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid("limit", "must be 1 to 200");
  const offset = Number(params.get("cursor") ?? 0);
  if (!Number.isInteger(offset) || offset < 0) return invalid("cursor", "Invalid cursor");
  return { ok: true, body: { data: all.slice(offset, offset + limit), next_cursor: offset + limit < all.length ? String(offset + limit) : null } };
}

export function createCommentsStore(now: () => number, orders: OrdersStore) {
  const stamp = (hoursAgo = 0) => new Date(now() - hoursAgo * HOUR).toISOString();
  const order1048 = orders.all().find((order) => order.number === 1048)!;
  const comments = new Map<string, OrderComment[]>([
    [
      order1048.id,
      [
        {
          id: uuid("d1d1d1d1", 1),
          line_id: null,
          author: { kind: "customer", id: uuid("d2d2d2d2", 1), name: "Rina Holt" },
          for_partner: false,
          body: "Could the polish stay matte?",
          attachments: [{ file_version_id: FILE_VERSION, name: "polish-sample.pdf" }],
          created_at: stamp(5),
        },
        {
          id: uuid("d1d1d1d1", 2),
          line_id: order1048.lines[0]!.id,
          author: { kind: "staff", id: uuid("55555555", 1), name: "Ana Ruiz" },
          for_partner: true,
          body: "Matte polish on these, please.",
          attachments: [],
          created_at: stamp(2),
        },
      ],
    ],
  ]);
  const keys = new Map<string, { input: string; body: OrderComment }>();

  const claim = (number: number, state: Claim["state"]): Claim => ({
    id: uuid("d3d3d3d3", number),
    number,
    order: { id: order1048.id, number: order1048.number },
    state,
    reason: { key: "damaged", name: "Damaged" },
    description: "One band arrived bent.",
    photos: [],
    return: null,
    lines: [],
    shipment: null,
    created_at: stamp(24),
  });
  const claims = [claim(1, "open"), claim(2, "closed")];

  const unknownOrder = (id: string) => !orders.get(id).ok;

  return {
    list(orderId: string, params: URLSearchParams): Answer<Page<OrderComment>> {
      if (unknownOrder(orderId)) return { ok: false, status: 404, detail: "Order not found" };
      return paged(comments.get(orderId) ?? [], params);
    },

    post(orderId: string, body: StaffCommentBody, author: { id: string; name: string }, key: string | null): Answer<OrderComment> {
      const found = orders.get(orderId);
      if (!found.ok) return found;
      const text = body.body.trim();
      if (text.length < 1 || text.length > COMMENT_MAX_LENGTH) return invalid("body", `must be 1 to ${COMMENT_MAX_LENGTH} characters`);
      if (body.for_partner && !body.line_id) return invalid("for_partner", "A comment for the partner needs a line");
      const lineIds = found.body.lines.flatMap((line) => [line.id, ...line.parts.map((part) => part.id)]);
      if (body.line_id && !lineIds.includes(body.line_id)) return invalid("line_id", "not a line of this order");

      const input = JSON.stringify({ orderId, body });
      const seen = key ? keys.get(key) : undefined;
      if (seen) return seen.input === input ? { ok: true, body: seen.body } : { ok: false, status: 409, detail: "Idempotency key reused with a different request" };

      const comment: OrderComment = {
        id: crypto.randomUUID(),
        line_id: body.line_id ?? null,
        author: { kind: "staff", id: author.id, name: author.name },
        for_partner: body.for_partner ?? false,
        body: text,
        attachments: [],
        created_at: stamp(),
      };
      comments.set(orderId, [...(comments.get(orderId) ?? []), comment]);
      if (key) keys.set(key, { input, body: comment });
      return { ok: true, body: comment };
    },

    attachmentUrl(orderId: string, commentId: string, fileVersionId: string): Answer<{ url: string; expires_at: string }> {
      const known = comments.get(orderId)?.find((comment) => comment.id === commentId)?.attachments.some((file) => file.file_version_id === fileVersionId);
      if (!known) return { ok: false, status: 404, detail: "Attachment not found" };
      return { ok: true, body: { url: `https://storage.example.test/${fileVersionId}`, expires_at: new Date(now() + 5 * 60_000).toISOString() } };
    },

    claims(params: URLSearchParams): Answer<Page<Claim>> {
      const orderId = params.get("order_id");
      return paged(claims.filter((row) => !orderId || row.order.id === orderId), params);
    },
  };
}
