import { useEffect, useRef, useState } from 'react';
import {
  HandoffCoordinator, readEnquiryAttempt, saveEnquiryAttempt, validateEnquiry,
  type ConsultationRuntime, type EnquiryInput, type SavedEnquiryAttempt,
} from '@workspace/consultation';
import { useRuntime } from '@/lib/runtime-context';

// Navigation must not create a second in-flight call. The host still owns durable,
// cross-worker idempotency and independently verifies every provider receipt.
const coordinators = new WeakMap<ConsultationRuntime, HandoffCoordinator>();
const STATUS_EVENT = 'syntra:enquiry-status';

function persist(key: string, attempt: SavedEnquiryAttempt) {
  saveEnquiryAttempt(sessionStorage, key, attempt);
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: key }));
}

export function useHandoffEnquiry(id: number) {
  const { runtime, scope } = useRuntime();
  const key = `syntra:enquiry:${JSON.stringify([scope, id])}`;
  const [initial] = useState(() => {
    try { return { attempt: readEnquiryAttempt(sessionStorage, key, id), blocked: false, error: null as string | null }; }
    catch { return { attempt: null, blocked: true, error: 'Saved enquiry status is unavailable. Check with the provider before making a new request.' }; }
  });
  const [attempt, setAttempt] = useState<SavedEnquiryAttempt | null>(initial.attempt);
  const [storageBlocked, setStorageBlocked] = useState(initial.blocked);
  const [error, setError] = useState(initial.error);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const requestId = useRef(initial.attempt?.input.requestId ?? crypto.randomUUID());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const refresh = () => {
      try {
        const saved = readEnquiryAttempt(sessionStorage, key, id);
        setAttempt(saved);
        if (saved?.state === 'confirmed') setError(null);
        if (saved?.state === 'failed') setError('Receipt was not confirmed. A retry keeps the same reviewed request.');
      } catch {
        setStorageBlocked(true);
        setError('Saved enquiry status is unavailable. Check with the provider before starting another.');
      }
    };
    const onStatus = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) refresh();
    };
    refresh();
    window.addEventListener(STATUS_EVENT, onStatus);
    return () => window.removeEventListener(STATUS_EVENT, onStatus);
  }, [key, id]);

  async function submit(details: Omit<EnquiryInput, 'requestId'>) {
    if (busy.current || attempt?.state === 'confirmed' || storageBlocked) return;
    const input = attempt?.input ?? { ...details, requestId: requestId.current };
    try { validateEnquiry(input); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Review the enquiry details.'); return; }
    const gateway = runtime.booking.submitEnquiry;
    if (!gateway) { setError('No verified enquiry integration is connected. Nothing was sent.'); return; }
    const pending: SavedEnquiryAttempt = { input, state: 'pending' };
    try { persist(key, pending); }
    catch { setError('This browser cannot save a safe retry record. Nothing was sent; enable session storage before submitting.'); return; }
    busy.current = true;
    setAttempt(pending);
    setSubmitting(true);
    setError(null);
    let next: SavedEnquiryAttempt;
    let failureMessage: string | null = null;
    try {
      let coordinator = coordinators.get(runtime);
      if (!coordinator) { coordinator = new HandoffCoordinator(); coordinators.set(runtime, coordinator); }
      const receipt = await coordinator.submit(input, { submitEnquiry: value => gateway.call(runtime.booking, value) });
      next = { input, state: 'confirmed', receipt };
    } catch (failure) {
      next = { input, state: 'failed' };
      failureMessage = failure instanceof Error ? failure.message : 'The provider did not confirm receipt.';
    }
    // This closure writes only its original scoped session, even after unmount.
    try { persist(key, next); }
    catch { failureMessage = 'Could not cache the latest provider status. Keep your reference; any retry retains the original request ID.'; }
    if (mounted.current) {
      setAttempt(next);
      setError(failureMessage);
      setSubmitting(false);
    }
    busy.current = false;
  }

  return {
    attempt, error, submitting, submit,
    locked: Boolean(attempt),
    storageBlocked,
    confirmed: attempt?.state === 'confirmed',
    receipt: attempt?.receipt,
  };
}
