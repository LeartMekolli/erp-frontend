/**
 * The fake erp-api's order comments and claims. It keeps the rules the order
 * page depends on (erp-api `src/modules/orders/comments.service.ts`): comments
 * oldest first, where it's posted decides who reads it (a line a partner has
 * accepted names that partner, anywhere else is staff only), a line must be on
 * the order, the body is strict, so an unknown key is a 400, and a post whose
 * `readers` isn't who would read it now is a 409 `readers_changed`. A partner reads
 * and writes on the line its job is made as, and only what names it.
 */

import type { Claim, OrderComment, OrderLine, OrderPart, PartnerJobComment, ReadersChangedProblem, StaffCommentBody } from "../../src/lib/api/schema-types";

import type { Answer, OrdersStore, Page } from "./orders";
import { uuid } from "./orders-seed";

const HOUR = 3_600_000;
const COMMENT_MAX_LENGTH = 5000;
const FILE_VERSION = uuid("d0d0d0d0", 1);
/** `staffCommentSchema`'s keys (erp-api `comments.service.ts:25`). */
const BODY_KEYS = ["body", "line_id", "attachments", "readers"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalid = (path: string, message: string): Answer<never> => ({ ok: false, status: 400, errors: [{ path, message }] });

/** The partner that has accepted a line: the one that reads a comment posted on it (erp-api `holder`). */
function holder(line: OrderLine | OrderPart): OrderComment["partner"] {
  return line.partner?.status === "accepted" ? { id: line.partner.id, name: line.partner.name } : null;
}

/** A comment as a partner reads it (erp-api `partnerView`): staff's are the workspace's, unnamed. */
function partnerView(comment: OrderComment): PartnerJobComment {
  const own = comment.author.kind === "partner";
  return {
    id: comment.id,
    body: comment.body,
    author: { kind: own ? "partner" : "workspace", name: own ? comment.author.name : null },
    attachments: comment.attachments,
    created_at: comment.created_at,
  };
}

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
          author: { kind: "staff", id: uuid("55555555", 1), name: "Ana Ruiz" },
          partner: null,
          body: "Rina asked for the polish to stay matte.",
          attachments: [{ file_version_id: FILE_VERSION, name: "polish-sample.pdf" }],
          created_at: stamp(5),
        },
        {
          id: uuid("d1d1d1d1", 2),
          line_id: order1048.lines[0]!.id,
          author: { kind: "staff", id: uuid("55555555", 1), name: "Ana Ruiz" },
          partner: holder(order1048.lines[0]!),
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

  /** The order and line a job is made as, and the comments a partner reads there (erp-api `partnerScope`). */
  function jobLine(groupId: string) {
    for (const order of orders.all()) {
      const line = order.lines.find((candidate) => candidate.group_id === groupId);
      if (line) return { orderId: order.id, lineId: line.id };
    }
    return null;
  }
  const partnerReads = (orderId: string, lineId: string, partnerId: string) =>
    (comments.get(orderId) ?? []).filter((comment) => comment.line_id === lineId && comment.partner?.id === partnerId);

  return {
    list(orderId: string, params: URLSearchParams): Answer<Page<OrderComment>> {
      if (unknownOrder(orderId)) return { ok: false, status: 404, detail: "Order not found" };
      return paged(comments.get(orderId) ?? [], params);
    },

    post(orderId: string, body: StaffCommentBody, author: { id: string; name: string }, key: string | null): Answer<OrderComment> {
      const found = orders.get(orderId);
      if (!found.ok) return found;
      const extra = Object.keys(body).find((name) => !BODY_KEYS.includes(name));
      if (extra) return invalid(extra, `Unrecognized key: "${extra}"`);
      const text = body.body.trim();
      if (text.length < 1 || text.length > COMMENT_MAX_LENGTH) return invalid("body", `must be 1 to ${COMMENT_MAX_LENGTH} characters`);
      const line = found.body.lines.flatMap((orderLine) => [orderLine, ...orderLine.parts]).find((candidate) => candidate.id === body.line_id);
      if (body.line_id && !line) return invalid("line_id", "not a line of this order");
      if (body.readers !== undefined && body.readers !== "staff" && !UUID.test(body.readers)) return invalid("readers", "must be staff or a partner's id");
      const partner = line ? holder(line) : null;

      const input = JSON.stringify({ orderId, body });
      const seen = key ? keys.get(key) : undefined;
      if (seen) return seen.input === input ? { ok: true, body: seen.body } : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };
      if (body.readers && body.readers !== (partner?.id ?? "staff")) {
        return {
          ok: false,
          status: 409,
          code: "readers_changed",
          detail: partner ? `${partner.name} has accepted this line and would read this comment too` : "Only staff would read this comment",
          extensions: { partner } satisfies Pick<ReadersChangedProblem, "partner">,
        };
      }

      const comment: OrderComment = {
        id: crypto.randomUUID(),
        line_id: body.line_id ?? null,
        author: { kind: "staff", id: author.id, name: author.name },
        partner,
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

    /** `GET .../jobs/{groupId}/comments`, for a job the partner holds: oldest first, only what names it. */
    partnerList(groupId: string, partnerId: string, params: URLSearchParams): Answer<Page<PartnerJobComment>> {
      const scope = jobLine(groupId);
      if (!scope) return { ok: false, status: 404, detail: "Job not found" };
      return paged(partnerReads(scope.orderId, scope.lineId, partnerId).map(partnerView), params);
    },

    /** `POST .../jobs/{groupId}/comments`: text only, strict, on the job's line, read by staff. */
    partnerPost(
      groupId: string,
      partner: { id: string; name: string },
      author: { id: string; name: string },
      body: Record<string, unknown>,
      key: string | null,
    ): Answer<PartnerJobComment> {
      const scope = jobLine(groupId);
      if (!scope) return { ok: false, status: 404, detail: "Job not found" };
      const extra = Object.keys(body).find((name) => name !== "body");
      if (extra) return invalid(extra, `Unrecognized key: "${extra}"`);
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (text.length < 1 || text.length > COMMENT_MAX_LENGTH) return invalid("body", `must be 1 to ${COMMENT_MAX_LENGTH} characters`);

      const input = JSON.stringify({ groupId, partner: partner.id, body });
      const seen = key ? keys.get(key) : undefined;
      if (seen) return seen.input === input ? { ok: true, body: partnerView(seen.body) } : { ok: false, status: 409, code: "idempotency_key_reused", detail: "Idempotency key reused with a different request" };

      const comment: OrderComment = {
        id: crypto.randomUUID(),
        line_id: scope.lineId,
        author: { kind: "partner", id: author.id, name: author.name },
        partner,
        body: text,
        attachments: [],
        created_at: stamp(),
      };
      comments.set(scope.orderId, [...(comments.get(scope.orderId) ?? []), comment]);
      if (key) keys.set(key, { input, body: comment });
      return { ok: true, body: partnerView(comment) };
    },

    /** An attachment of a comment the partner reads; any other is not found. */
    partnerAttachmentUrl(groupId: string, partnerId: string, commentId: string, fileVersionId: string): Answer<{ url: string; expires_at: string }> {
      const scope = jobLine(groupId);
      const known = scope && partnerReads(scope.orderId, scope.lineId, partnerId).find((comment) => comment.id === commentId)?.attachments.some((file) => file.file_version_id === fileVersionId);
      if (!known) return { ok: false, status: 404, detail: "Attachment not found" };
      return { ok: true, body: { url: `https://storage.example.test/${fileVersionId}`, expires_at: new Date(now() + 5 * 60_000).toISOString() } };
    },

    claims(params: URLSearchParams): Answer<Page<Claim>> {
      const orderId = params.get("order_id");
      return paged(claims.filter((row) => !orderId || row.order.id === orderId), params);
    },
  };
}
