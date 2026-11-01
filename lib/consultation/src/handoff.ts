import type { Brief, BriefFields, ContactOption } from "./types.ts";

export const HANDOFF_LABELS: ReadonlyArray<readonly [keyof BriefFields, string]> = [
  ["objective", "Business objective"],
  ["service", "Service direction"],
  ["proposedSolution", "Proposed solution"],
  ["requirements", "Requirements"],
  ["integrations", "Integrations & dependencies"],
  ["budget", "Budget"],
  ["timeline", "Timeline"],
  ["nextStep", "Recommended next step"],
];

const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export function formatProjectBrief(
  brief: Brief,
  options: { title?: string; includeProvenance?: boolean } = {},
): string {
  const title = clean(options.title || "Digital Prodigy — Project Brief").slice(0, 140);
  const lines = [`# ${title}`, "", "Prepared with Syntra by Digital Prodigy.", "This is a working project brief, not a formal quotation, delivery commitment, or confirmed booking.", "", "## Project outline", ""];
  for (const [key, label] of HANDOFF_LABELS) {
    const value = brief[key]?.trim();
    const status = brief.provenance[key]?.status;
    const name = status === "manual" ? "Edited by visitor" : status === "suggested" ? "Suggested" : status === "confirmed" ? "Confirmed" : "Not established";
    lines.push(`### ${label}`);
    lines.push(value || "Not established yet.");
    if (options.includeProvenance !== false) lines.push(`_Status: ${name}_`);
    lines.push("");
  }
  lines.push("---", "Please review and correct any assumptions before discussing scope, pricing or a delivery schedule.");
  return lines.join("\n");
}

export function briefCompleteness(brief: Brief): { complete: number; total: number; suggested: number } {
  return {
    complete: HANDOFF_LABELS.filter(([key]) => Boolean(brief[key]?.trim())).length,
    total: HANDOFF_LABELS.length,
    suggested: HANDOFF_LABELS.filter(([key]) => brief.provenance[key]?.status === "suggested").length,
  };
}

/** A destination must be approved by the host AND use an ordinary, safe contact protocol. */
export function safeContactHref(contact: ContactOption): string | null {
  const raw = contact.href.trim();
  if (/["'<>\u0000-\u001f\u007f]/.test(raw) || raw.length > 2048) return null;
  try {
    if (contact.kind === "link") {
      const parsed = new URL(raw);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
    }
    if (contact.kind === "email") {
      const match = /^mailto:([^?&#]+)$/i.exec(raw);
      return match && /^[^\s@,;%]+@[^\s@,;%]+\.[^\s@,;%]+$/.test(match[1]) ? `mailto:${match[1]}` : null;
    }
    if (contact.kind === "phone") {
      return /^tel:\+?[0-9() .-]{7,22}$/i.test(raw) ? raw : null;
    }
  } catch { return null; }
  return null;
}

export type HandoffStage = "unconfigured" | "ready" | "submitting" | "confirmed" | "failed";
export interface EnquiryInput {
  conversationId: number;
  requestId: string;
  briefRevision: number;
  brief: BriefFields;
  name: string;
  email: string;
  note?: string;
  consent: boolean;
}
export interface EnquiryReceipt {
  status: "confirmed";
  reference: string;
}
export interface EnquiryGateway {
  submitEnquiry(input: EnquiryInput): Promise<EnquiryReceipt>;
}
export class HandoffError extends Error {
  readonly code: "consent" | "details" | "collision" | "unconfirmed";
  constructor(code: "consent" | "details" | "collision" | "unconfirmed", message: string) {
    super(message);
    this.code = code;
    this.name = "HandoffError";
  }
}

export function validateEnquiry(input: EnquiryInput): void {
  if (!input || typeof input !== "object") throw new HandoffError("details", "Review the enquiry details before submitting.");
  if (input.consent !== true) throw new HandoffError("consent", "Review the project brief and consent before submitting.");
  if (!Number.isSafeInteger(input.conversationId) || input.conversationId <= 0 ||
      !Number.isSafeInteger(input.briefRevision) || input.briefRevision < 0 ||
      typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(input.requestId)) {
    throw new HandoffError("details", "This consultation cannot be submitted. Refresh the session and try again.");
  }
  if (typeof input.name !== "string" || typeof input.email !== "string" ||
      (input.note !== undefined && typeof input.note !== "string") ||
      clean(input.name).length < 2 || clean(input.name).length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || input.email.length > 254 ||
      (input.note?.length ?? 0) > 2000) {
    throw new HandoffError("details", "Enter a valid name and email address.");
  }
  if (!input.brief || typeof input.brief !== "object" || Array.isArray(input.brief) ||
      HANDOFF_LABELS.some(([key]) => input.brief[key] !== null &&
        (typeof input.brief[key] !== "string" || input.brief[key]!.length > 4000))) {
    throw new HandoffError("details", "The project brief contains invalid or oversized fields. Review it before submitting.");
  }
  if (!input.brief.objective?.trim()) {
    throw new HandoffError("details", "Review a clear project objective before submitting.");
  }
}

/**
 * Local guard for duplicate clicks; a production gateway MUST additionally enforce
 * durable server-side idempotency and ownership. This controller never simulates success.
 */
export class HandoffCoordinator {
  private readonly inflight = new Map<string, { signature: string; promise: Promise<EnquiryReceipt> }>();
  private readonly complete = new Map<string, { signature: string; receipt: EnquiryReceipt }>();
  // An unconfirmed outcome may already have reached the provider. A retry must
  // never reuse its identity for a different reviewed intent, even after failure.
  private readonly reserved = new Map<string, string>();

  async submit(input: EnquiryInput, gateway?: EnquiryGateway): Promise<EnquiryReceipt> {
    validateEnquiry(input);
    if (!gateway) return Promise.reject(new HandoffError("unconfirmed", "No verified enquiry integration has been connected."));
    // Copy only the eight agreed fields. Caller edits after admission cannot
    // change the external action or the consented snapshot held for its retry.
    const snapshot: EnquiryInput = Object.freeze({
      conversationId: input.conversationId, requestId: input.requestId,
      briefRevision: input.briefRevision,
      brief: Object.freeze(Object.fromEntries(HANDOFF_LABELS.map(([key]) => [key, input.brief[key]]))) as unknown as BriefFields,
      name: clean(input.name), email: input.email.trim(), note: input.note?.trim(), consent: true,
    });
    const signature = JSON.stringify([snapshot.conversationId, snapshot.briefRevision, snapshot.brief,
      snapshot.name, snapshot.email, snapshot.note || ""]);
    const reserved = this.reserved.get(snapshot.requestId);
    if (reserved && reserved !== signature) throw new HandoffError("collision", "This request ID belongs to an earlier reviewed enquiry. Retry its original details.");
    const previous = this.complete.get(snapshot.requestId);
    if (previous) {
      if (previous.signature !== signature) return Promise.reject(new HandoffError("collision", "This request ID was already used for different details."));
      return { ...previous.receipt };
    }
    const active = this.inflight.get(snapshot.requestId);
    if (active) {
      if (active.signature !== signature) return Promise.reject(new HandoffError("collision", "This request ID is already in progress with different details."));
      return { ...await active.promise };
    }
    this.reserved.set(snapshot.requestId, signature);
    const promise = Promise.resolve().then(() => gateway.submitEnquiry(snapshot)).then(receipt => {
      if (!receipt || receipt.status !== "confirmed" || typeof receipt.reference !== "string" || !receipt.reference.trim()) {
        throw new HandoffError("unconfirmed", "The provider did not confirm the enquiry. Please check before retrying.");
      }
      const normalized: EnquiryReceipt = { status: "confirmed", reference: receipt.reference.trim() };
      this.complete.set(snapshot.requestId, { signature, receipt: normalized });
      return normalized;
    }).finally(() => this.inflight.delete(snapshot.requestId));
    this.inflight.set(snapshot.requestId, { signature, promise });
    return { ...await promise };
  }
}

/** Only consented attempts are cached, in this browser tab, for safe replay after navigation/refresh. */
export interface SavedEnquiryAttempt {
  input: EnquiryInput;
  state: "pending" | "failed" | "confirmed";
  receipt?: EnquiryReceipt;
}
export interface EnquiryAttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function readEnquiryAttempt(storage: EnquiryAttemptStorage, key: string, conversationId: number): SavedEnquiryAttempt | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const attempt = JSON.parse(raw) as SavedEnquiryAttempt;
    validateEnquiry(attempt.input);
    if (attempt.input.conversationId !== conversationId ||
        !["pending", "failed", "confirmed"].includes(attempt.state) ||
        (attempt.state === "confirmed" && (!attempt.receipt || attempt.receipt.status !== "confirmed" ||
          typeof attempt.receipt.reference !== "string" || !attempt.receipt.reference.trim()))) throw Error("Invalid receipt");
    return attempt;
  } catch {
    throw new HandoffError("unconfirmed", "The saved enquiry could not be restored safely. Check its status with the provider before starting another.");
  }
}
export function saveEnquiryAttempt(storage: EnquiryAttemptStorage, key: string, attempt: SavedEnquiryAttempt): void {
  validateEnquiry(attempt.input);
  storage.setItem(key, JSON.stringify(attempt));
}
