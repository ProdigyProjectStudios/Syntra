import { ConsultationError } from './engine.ts';
import type { Brief } from './types.ts';
import {
  emptyBlueprint, evolveBlueprint, manualBlueprint, normalizeStoredBlueprint,
  type Blueprint, type BlueprintMutation, type BlueprintUpdateInput,
} from './blueprint.ts';

interface BlueprintReceipt { requestId: string; kind: 'update' | 'regenerate'; signature: string }
export interface BlueprintStore { document: Blueprint; receipts: BlueprintReceipt[] }
const MAX_RECEIPTS = 128;
export const BLUEPRINT_VERSION_CONFLICT = 'BLUEPRINT_VERSION_CONFLICT';
export const BLUEPRINT_VERSION_CONFLICT_MESSAGE = 'The Blueprint changed. Reload it before applying your edit.';
export class BlueprintVersionConflict extends ConsultationError {
  readonly code = BLUEPRINT_VERSION_CONFLICT;
  constructor() { super(409, BLUEPRINT_VERSION_CONFLICT_MESSAGE); }
}
export const BLUEPRINT_CHANGE_REJECTED = 'BLUEPRINT_CHANGE_REJECTED';
// The native host preserves error messages but does not expose custom error data.
// This friendly prefix is emitted only for a proven rejection before persistence.
export const BLUEPRINT_CHANGE_REJECTED_PREFIX = 'This Blueprint change was not saved. ';
export class BlueprintChangeRejected extends ConsultationError {
  readonly code = BLUEPRINT_CHANGE_REJECTED;
  constructor(status: number, message: string) { super(status, BLUEPRINT_CHANGE_REJECTED_PREFIX + message); }
}

/** Kept outside provenance: this is a private durable document plus retry receipts. */
export function readBlueprintStore(value: unknown): BlueprintStore {
  if (value === null || value === undefined) return { document: emptyBlueprint(), receipts: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConsultationError(500, 'The saved Blueprint could not be read. Your consultation is preserved.');
  const store = value as Partial<BlueprintStore>;
  if (!Array.isArray(store.receipts) || store.receipts.length > MAX_RECEIPTS || !store.receipts.every(receipt =>
    receipt && typeof receipt.requestId === 'string' && /^[\w-]{8,100}$/.test(receipt.requestId) &&
    (receipt.kind === 'update' || receipt.kind === 'regenerate') && typeof receipt.signature === 'string' && /^[a-f0-9]{64}$/.test(receipt.signature)) ||
    new Set(store.receipts.map(receipt => receipt.requestId)).size !== store.receipts.length || (store.document === undefined || store.document === null)) {
    throw new ConsultationError(500, 'The saved Blueprint could not be read. Your consultation is preserved.');
  }
  return { document: normalizeStoredBlueprint(store.document), receipts: structuredClone(store.receipts) };
}

export function validateBlueprintMutation(input: unknown, kind: 'update' | 'regenerate'): asserts input is BlueprintUpdateInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ConsultationError(400, 'A Blueprint version and request identity are required.');
  const value = input as Partial<BlueprintUpdateInput>;
  const allowed = kind === 'update' ? ['version', 'requestId', 'edit'] : ['version', 'requestId'];
  if (!Number.isSafeInteger(value.version) || value.version! < 0 || typeof value.requestId !== 'string' ||
      !/^[\w-]{8,100}$/.test(value.requestId) || Object.keys(input).some(key => !allowed.includes(key))) {
    throw new ConsultationError(400, 'Provide the current Blueprint version and a valid request identity.');
  }
  if (kind === 'update' && (!value.edit || typeof value.edit !== 'object' || Array.isArray(value.edit))) {
    throw new ConsultationError(400, 'Choose a Blueprint item to edit.');
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Caller supplies its existing DB/native session lock. No model or external action occurs. */
export async function mutateBlueprintStore(store: BlueprintStore, input: BlueprintMutation | BlueprintUpdateInput,
  kind: 'update' | 'regenerate', brief: Brief): Promise<BlueprintStore> {
  const requestId = input && typeof input === 'object' ? input.requestId : undefined;
  const receipt = store.receipts.find(item => item.requestId === requestId);
  try { validateBlueprintMutation(input, kind); } catch (error) {
    // Malformed retries must not release a receipt for an already saved change.
    if (!receipt && typeof requestId === 'string' && /^[\w-]{8,100}$/.test(requestId) && error instanceof ConsultationError) {
      throw new BlueprintChangeRejected(error.status, error.message);
    }
    throw error;
  }
  const encoded = new TextEncoder().encode(canonical({ kind, input }));
  if (encoded.length > 20000) {
    if (!receipt) throw new BlueprintChangeRejected(400, 'This Blueprint edit is too large.');
    throw new ConsultationError(409, 'This Blueprint request identity was already used for another change.');
  }
  const signature = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (receipt) {
    if (receipt.kind !== kind || receipt.signature !== signature) throw new ConsultationError(409, 'This Blueprint request identity was already used for another change.');
    return store; // The newest document wins over an old retry snapshot.
  }
  if (input.version !== store.document.version) throw new BlueprintVersionConflict();
  if (store.receipts.length >= MAX_RECEIPTS) throw new BlueprintChangeRejected(422, 'This consultation has reached its Blueprint edit limit. Your saved deliverable and retries remain available.');
  let document: Blueprint;
  try {
    document = kind === 'update'
      ? manualBlueprint(store.document, (input as BlueprintUpdateInput).edit, input.version)
      : evolveBlueprint(store.document, brief, [], { visitorHistory: [], latest: '', source: 'regenerate' });
  } catch (error) {
    // Only pure domain validation runs here. Storage/commit errors are outside
    // this boundary and must retain the original operation for an exact retry.
    if (error instanceof ConsultationError && [400, 404, 422].includes(error.status)) {
      throw new BlueprintChangeRejected(error.status, error.message);
    }
    throw error;
  }
  return { document, receipts: [...store.receipts, { requestId: input.requestId, kind, signature }] };
}
