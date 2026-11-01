import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, RotateCw, Mic, MicOff, Square, Volume2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getSpecialistProfile, SPECIALISTS, type SpecialistId, type VoiceConnection, type VoiceEvent } from '@workspace/consultation';
import { useRuntime, useRuntimeKeys } from '@/lib/runtime-context';
import { useAdvisor } from '@/lib/advisor';
import { cn } from '@/lib/utils';
import { NeuralCore, type CoreState } from '@/components/neural-core';
import { VoiceSpecialistRail, SPECIALIST_VISUALS } from '@/components/voice-specialist-rail';
import { VoiceConnectionLifecycle, isLocalVoiceNotice, reconnectFailure } from '@/components/voice-connection-lifecycle';
import { useMediaQuery } from '@/hooks/use-media-query';

/** Any surface can open voice mode by dispatching this window event. */
export const OPEN_VOICE_EVENT = 'dp:open-voice';

type Caption = Extract<VoiceEvent, { type: 'transcript' }>;
type VoiceFailure = Omit<Extract<VoiceEvent, { type: 'error' }>, 'type'>;
type TransportState = Extract<VoiceEvent, { type: 'state' }>['state'];

function captionMatches(previous: Caption | null, next: Caption) {
  return previous?.id === next.id && previous?.role === next.role &&
    previous?.text === next.text && previous?.final === next.final;
}

export function VoiceConsole({ open, onClose, onConnectionFailed }: { open: boolean; onClose: () => void; onConnectionFailed?: () => void }) {
  const { runtime, native, scope } = useRuntime();
  const { getGetConversationQueryKey, getGetBriefQueryKey, getListConversationsQueryKey, getGetBlueprintQueryKey } = useRuntimeKeys();
  const { ensureVoiceConversation: ensureConversation, depth, specialist: sharedSpecialist, setSpecialist: setSharedSpecialist } = useAdvisor();
  const qc = useQueryClient();
  const reduceMotion = useReducedMotion();
  const compact = useMediaQuery('(max-width: 639px)');
  const [failure, setFailure] = useState<VoiceFailure | null>(null);
  const [transportState, setTransportState] = useState<TransportState>('connecting');
  const [caption, setCaption] = useState<Caption | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<VoiceConnection | null>(null);
  const [muted, setMuted] = useState(false);
  const [controlPending, setControlPending] = useState(false);
  const [specialist, setSpecialist] = useState<SpecialistId>(sharedSpecialist);
  const [inputSpeaking, setInputSpeaking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [, refreshControls] = useState(0);
  const [size, setSize] = useState(560);
  const amplitude = useRef(0);
  const connectionRef = useRef<VoiceConnection | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const previousCaptionRef = useRef<Caption | null>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const sharedSpecialistRef = useRef(sharedSpecialist); sharedSpecialistRef.current = sharedSpecialist;
  const setSharedSpecialistRef = useRef(setSharedSpecialist); setSharedSpecialistRef.current = setSharedSpecialist;
  const specialistRef = useRef(specialist);
  specialistRef.current = specialist;
  const switchingRef = useRef(false);
  const retryPreparation = useRef<AbortController | null>(null);
  const connectionFailed = useRef(onConnectionFailed);
  connectionFailed.current = onConnectionFailed;

  useEffect(() => () => { retryPreparation.current?.abort(); retryPreparation.current = null; }, [open]);

  useEffect(() => {
    if (!open) return;
    setFailure(null); setCaption(null); setTransportState('connecting');
    setConnection(null); setMuted(false); setControlPending(false); amplitude.current = 0;
    setInputSpeaking(false); setSwitching(false); setSelectionNotice(null); switchingRef.current = false;
    if (!runtime.voice.available) { specialistRef.current = sharedSpecialistRef.current; setSpecialist(sharedSpecialistRef.current); return; }
    const initialSpecialist = runtime.voice.specialists?.includes(sharedSpecialistRef.current) ? sharedSpecialistRef.current : 'syntra';
    specialistRef.current = initialSpecialist; setSpecialist(initialSpecialist);
    const controller = new AbortController();
    const closeFailure: VoiceFailure = {
      message: 'The voice connection could not close cleanly. Continue in chat and check your browser’s microphone indicator.',
      recoverable: false,
      retryable: false,
    };
    const lifecycle = new VoiceConnectionLifecycle(controller.signal, () => setFailure(closeFailure));
    let voiceConversationId: number | undefined;
    const handleEvent = (event: VoiceEvent) => {
      if (!lifecycle.admitEvent(event)) return;
      switch (event.type) {
        case 'specialist':
          // The adapter may restore a pending turn with a different role after reload.
          if (event.specialist !== specialistRef.current) setCaption(null);
          specialistRef.current = event.specialist; setSpecialist(event.specialist);
          if (runtime.voice.specialists?.includes(event.specialist)) setSharedSpecialistRef.current(event.specialist);
          break;
        case 'input':
          setInputSpeaking(event.speaking);
          // Final recognition can settle after speech-end without changing this boolean.
          refreshControls(value => value + 1);
          break;
        case 'amplitude':
          amplitude.current = Number.isFinite(event.value) ? Math.max(0, Math.min(1, event.value)) : 0;
          break;
        case 'state':
          amplitude.current = 0;
          setTransportState(event.state);
          if (event.state === 'closed') {
            connectionRef.current = null; setConnection(null);
            setInputSpeaking(false); setMuted(false); setControlPending(false);
            setSelectionNotice(null);
            switchingRef.current = false; setSwitching(false);
            setFailure(previous => lifecycle.closeFailed ? closeFailure : reconnectFailure(previous));
          }
          break;
        case 'transcript':
          setCaption(previous => captionMatches(previous, event) ? previous : event);
          // Accepted speech can move past a local notice; uncertain sends require explicit recovery.
          if (event.role === 'visitor') setFailure(previous =>
            previous?.recovery === 'playback' ||
            (event.final && previous?.recoverable && previous.retryable === false && !previous.recovery) ? null : previous);
          break;
        case 'transcript-clear':
          setCaption(previous => previous?.role === event.role && !previous.final &&
            (!event.id || previous.id === event.id) ? null : previous);
          refreshControls(value => value + 1);
          break;
        case 'conversation-updated':
          // Capability getters can change even when the visible transport state stays listening.
          refreshControls(value => value + 1);
          if (voiceConversationId) {
            void qc.invalidateQueries({ queryKey: getGetConversationQueryKey(voiceConversationId) });
            void qc.invalidateQueries({ queryKey: getGetBriefQueryKey(voiceConversationId) });
            void qc.invalidateQueries({ queryKey: getGetBlueprintQueryKey(voiceConversationId) });
            void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          }
          break;
        case 'error':
          if (!lifecycle.closed && isLocalVoiceNotice(event)) setSelectionNotice(event.message);
          else {
            setFailure(lifecycle.closed ? lifecycle.closeFailed ? closeFailure : reconnectFailure(event) : event);
            amplitude.current = 0;
          }
          break;
      }
    };
    void (async () => {
      try {
        const id = await ensureConversation();
        if (controller.signal.aborted) return;
        await runtime.sessions.setDepth?.(id, depthRef.current);
        voiceConversationId = id;
        if (controller.signal.aborted) return;
        const connected = await runtime.voice.connect(id, handleEvent, controller.signal, { depth: depthRef.current, specialist: initialSpecialist });
        if (lifecycle.attach(connected)) {
          connectionRef.current = connected;
          setConnection(connected);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          retryPreparation.current?.abort(); retryPreparation.current = null;
          connectionFailed.current?.();
        }
        if (!controller.signal.aborted && !lifecycle.closeFailed &&
            !(lifecycle.closed && error instanceof Error && error.name === 'AbortError')) {
          const detail = { message: error instanceof Error ? error.message : 'Voice could not connect. Your consultation is still available in chat.' };
          setFailure(lifecycle.closed ? reconnectFailure(detail) : detail);
        }
      }
    })();
    return () => {
      const ownedConnection = lifecycle.connection;
      controller.abort(); amplitude.current = 0;
      switchingRef.current = false;
      if (connectionRef.current === ownedConnection) connectionRef.current = null;
      lifecycle.dispose();
    };
  }, [open, attempt, ensureConversation, runtime, scope, qc, getGetConversationQueryKey, getGetBriefQueryKey, getListConversationsQueryKey, getGetBlueprintQueryKey]);

  useEffect(() => {
    if (!open || !stageRef.current) return;
    const stage = stageRef.current;
    const resize = () => setSize(Math.round(Math.max(64, Math.min(stage.clientWidth * 0.92, stage.clientHeight - (detailsRef.current?.offsetHeight ?? 140) + 16, 560))));
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    if (detailsRef.current) observer.observe(detailsRef.current);
    resize();
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current?.getRootNode();
    const previousFocus = (root instanceof ShadowRoot ? root.activeElement : document.activeElement) as HTMLElement | null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    const previous = previousCaptionRef.current;
    const completeReply = caption?.role === 'advisor' && caption.final &&
      (previous?.role !== 'advisor' || previous.id !== caption.id || previous.final);
    if (captionRef.current) captionRef.current.scrollTop = completeReply ? 0 : captionRef.current.scrollHeight;
    previousCaptionRef.current = caption;
  }, [caption]);

  useEffect(() => {
    if (recoveryRef.current) recoveryRef.current.scrollTop = 0;
  }, [failure?.originalTurn?.requestId]);

  useEffect(() => {
    if (!selectionNotice) return;
    const timer = window.setTimeout(() => setSelectionNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [selectionNotice]);

  function containFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
    if (!elements?.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    const root = dialogRef.current?.getRootNode();
    const focused = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    if (event.shiftKey && (focused === first || focused === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && focused === last) { event.preventDefault(); first.focus(); }
  }

  async function changeMute() {
    const current = connectionRef.current;
    if (!current?.setMuted || controlPending) return;
    setControlPending(true);
    try {
      await current.setMuted(!muted);
      if (connectionRef.current === current) setMuted(!muted);
    } catch {
      if (connectionRef.current === current) setFailure({ message: 'The microphone setting could not be changed. End voice to release the microphone.' });
    } finally {
      if (connectionRef.current === current) setControlPending(false);
    }
  }

  async function interrupt() {
    const current = connectionRef.current;
    if (!current?.interrupt) return;
    try { await current.interrupt(); }
    catch {
      if (connectionRef.current === current) setFailure({ message: 'Playback could not be stopped. End voice to close the audio connection.' });
    }
  }

  async function recover() {
    if (!failure || controlPending) return;
    const current = connectionRef.current;
    const retry = failure.recovery === 'turn' ? current?.retryTurn : failure.recovery === 'playback' ? current?.retryPlayback : undefined;
    // Ambiguous sends must be recovered through their original connection and request ID.
    if (failure.recovery && !retry) return;
    if (!failure.recovery) {
      retryPreparation.current?.abort();
      const preparation = new AbortController();
      retryPreparation.current = preparation;
      runtime.voice.prepare?.(preparation.signal);
      setAttempt(value => value + 1); return;
    }
    const previousFailure = failure;
    setControlPending(true); setFailure(null);
    try { await retry!.call(current); }
    catch (error) {
      if (connectionRef.current === current) setFailure({ ...previousFailure, message: error instanceof Error ? error.message : previousFailure.message });
    } finally {
      if (connectionRef.current === current) setControlPending(false);
    }
  }

  async function chooseSpecialist(id: SpecialistId) {
    if (id === specialistRef.current || switchingRef.current || controlPending) return;
    if (!runtime.voice.available) {
      specialistRef.current = id; setSpecialist(id); setCaption(null); setSelectionNotice(null);
      return;
    }
    const current = connectionRef.current;
    if (!current?.setSpecialist || !runtime.voice.specialists?.includes(id) || failure || inputSpeaking ||
        transportState === 'thinking' || transportState === 'connecting' || transportState === 'closed' ||
        current.canSwitchSpecialist?.() === false) return;
    switchingRef.current = true; setSwitching(true); setSelectionNotice(null);
    try {
      await current.setSpecialist(id);
      if (connectionRef.current !== current) return;
      specialistRef.current = id; setSpecialist(id); setSharedSpecialistRef.current(id); setCaption(null);
      amplitude.current = 0;
    } catch (error) {
      if (connectionRef.current === current) setSelectionNotice(error instanceof Error ? error.message : 'The specialist could not change. Your current conversation is still open.');
    } finally {
      if (connectionRef.current === current) { switchingRef.current = false; setSwitching(false); }
    }
  }

  const available = runtime.voice.available;
  const state: CoreState = failure ? 'error' : !available ? 'idle' :
    transportState === 'speaking' ? 'speaking' :
    transportState === 'connecting' || transportState === 'thinking' ? 'connecting' : 'idle';
  const label = !available ? 'Voice not connected' : failure ? 'Voice paused' :
    muted && transportState === 'listening' ? 'Microphone paused' :
    { connecting: 'Connecting', listening: 'Listening', thinking: 'Preparing a response', speaking: 'Speaking', closed: 'Disconnected' }[transportState];
  const canRecover = Boolean(failure && failure.retryable !== false &&
    (!failure.recovery || (failure.recovery === 'turn' ? connection?.retryTurn : connection?.retryPlayback)));
  const recoveryLabel = failure?.recovery === 'turn' ? 'Retry this turn' : failure?.recovery === 'playback' ? 'Replay response' : 'Reconnect';
  const discloseProvider = available && !native;
  const stageBottom = 56 + (canRecover ? discloseProvider ? 196 : 160 : discloseProvider ? 144 : 128);
  const profile = getSpecialistProfile(specialist);
  const visual = SPECIALIST_VISUALS[specialist];
  const supported = !available ? SPECIALISTS.map(item => item.id) : runtime.voice.specialists ?? ['syntra'] as const;
  const lockedReason = !available ? undefined : failure ? 'Resolve the current voice issue before changing specialist.' :
    switching || controlPending ? 'Please wait for the current action.' : !connection || transportState === 'connecting' ? 'Connecting your voice session.' :
    inputSpeaking ? 'Finish speaking before changing specialist.' : transportState === 'thinking' || connection.canSwitchSpecialist?.() === false ? 'Let the current turn finish before changing specialist.' :
    transportState === 'closed' ? 'Reconnect voice to change specialist.' : !connection.setSpecialist ? 'Specialist switching is not available in this voice session.' : undefined;

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={dialogRef}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : .4 } }}
          transition={{ duration: reduceMotion ? 0 : .55, ease: [0.16, 1, 0.3, 1] }}
          role="dialog" aria-modal="true" aria-label="Syntra voice conversation" tabIndex={-1}
          onKeyDown={containFocus}
        >
          <div className="absolute inset-0 bg-[#04030B]" />
          <motion.div className="pointer-events-none absolute inset-0" animate={{ filter: `hue-rotate(${visual.hue}deg)` }}
            transition={{ duration: reduceMotion ? 0 : .6 }}
            style={{ background: 'radial-gradient(60% 55% at 50% 45%, rgba(29,78,216,.16), rgba(34,211,238,.05) 40%, transparent 70%)' }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.75))' }} />

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <div className="sr-only min-w-0 items-center gap-2.5 font-mono text-[9px] uppercase tracking-[.22em] text-white/45 sm:not-sr-only sm:flex sm:text-[10px] sm:tracking-[.3em]">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className={cn('absolute inset-0 rounded-full', failure ? 'bg-rose-400' : 'bg-primary', available && !failure && !muted && 'motion-safe:animate-ping opacity-60')} />
                <span className={cn('relative h-1.5 w-1.5 rounded-full', failure ? 'bg-rose-400' : 'bg-primary')} />
              </span>
              <span>{profile.name}</span><span className="text-white/20">/</span>
              <span role="status" className={cn('truncate', failure ? 'text-rose-300/80' : 'text-primary/80')} data-testid="status-voice-state">{label}</span>
            </div>
            <button ref={closeButtonRef} onClick={onClose} aria-label="Close voice conversation" data-testid="button-close-voice"
              className="ml-auto grid h-10 w-10 shrink-0 self-start place-items-center rounded-full text-white/45 transition hover:bg-white/[.05] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <div aria-hidden="true" className="shrink-0 pt-[calc(7rem+env(safe-area-inset-top))] sm:pt-[calc(4.5rem+env(safe-area-inset-top))]" />
          <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center top-[max(.5rem,env(safe-area-inset-top))]">
            <VoiceSpecialistRail active={specialist} onSelect={id => void chooseSpecialist(id)} supported={supported}
              lockedReason={lockedReason} switching={switching} compact={compact} preview={!available} state={state} amplitude={amplitude} />
          </div>

          <div ref={stageRef} className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center" style={{ marginBottom: `calc(${stageBottom}px + env(safe-area-inset-bottom))` }}>
            <motion.div initial={reduceMotion ? false : { scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 1, ease: [0.16, 1, 0.3, 1] }} className="pointer-events-none relative z-[5] shrink-0" data-testid="voice-primary-core">
              <motion.div animate={{ filter: `hue-rotate(${failure ? 0 : visual.hue}deg)` }} transition={{ duration: reduceMotion ? 0 : .55 }}>
                <NeuralCore state={state} amplitude={amplitude} size={size} />
              </motion.div>
              <motion.div className="absolute inset-[17%] rounded-[50%] border border-transparent"
                animate={{ rotate: visual.orbit, scaleY: specialist === 'technical' ? .65 : specialist === 'automation' ? .42 : .54, opacity: failure ? 0 : .3 }}
                transition={{ duration: reduceMotion ? 0 : .6 }} style={{ borderTopColor: `${visual.color}55`, borderBottomColor: `${visual.color}18` }} />
            </motion.div>

            <div ref={detailsRef} className="relative z-10 -mt-4 w-full max-w-2xl shrink-0 px-6 text-center sm:-mt-6">
              <div className="mb-3" data-testid="voice-active-specialist">
                <p aria-hidden="true" className="mb-2 font-mono text-[8px] uppercase tracking-[.2em] text-white/45 sm:hidden">{label}</p>
                <motion.p key={profile.id} initial={reduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : .24 }} className="font-display text-[15px] font-light tracking-[.18em]" style={{ color: visual.color }}>{profile.name}</motion.p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[.18em] text-white/35">{profile.title}</p>
                {selectionNotice && <p role="status" className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-amber-200/85">{selectionNotice}</p>}
              </div>
              {failure ? (
                <div ref={recoveryRef} role="region" className="mx-auto max-h-[min(19dvh,160px)] max-w-lg overflow-y-auto overscroll-contain scroll-thin"
                  tabIndex={0} aria-label="Voice recovery details" data-testid="status-voice-error">
                  <p role="alert" className="text-sm leading-relaxed text-rose-200/90">{failure.message}</p>
                  {failure.recovery === 'turn' && <p className="mt-2 text-xs leading-relaxed text-white/45">Retry preserves your original turn. Your saved conversation and brief stay together.</p>}
                  {failure.recovery === 'turn' && failure.originalTurn && <div className="mt-3 text-left" data-testid="voice-original-request">
                    <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[.2em] text-primary/65">Original request · retry uses these words</p>
                    <p className="whitespace-pre-wrap break-words text-sm font-light leading-relaxed text-white/65">{failure.originalTurn.content}</p>
                  </div>}
                </div>
              ) : caption?.text ? (
                <div>
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[.25em] text-primary/65">
                    {caption.role === 'visitor' ? 'You' : profile.name}{!caption.final && <span className="text-white/30"> / live</span>}
                  </div>
                  <div ref={captionRef} className="max-h-[min(19dvh,160px)] overflow-y-auto overscroll-contain scroll-thin"
                    tabIndex={0} aria-label={caption.role === 'visitor' ? 'Your live transcript' : `${profile.name} response`} data-testid="voice-transcript">
                    <p aria-live={caption.final ? 'polite' : 'off'} aria-atomic="true"
                      className="whitespace-pre-wrap break-words text-[18px] font-light leading-relaxed tracking-tight text-foreground/90 sm:text-[24px]">
                      {caption.text}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mx-auto max-w-md text-sm font-light leading-relaxed text-white/50" data-testid="voice-idle-guidance">
                  {!available ? 'Voice is not connected in this environment. Continue your consultation in chat.' :
                    muted ? 'Your microphone is paused. Unmute when you are ready.' :
                    transportState === 'connecting' ? 'Connecting your microphone and voice.' :
                    transportState === 'thinking' ? 'Preparing your response…' : 'Go ahead. I’m listening.'}
                </p>
              )}
            </div>
          </div>

          <div className={cn('absolute inset-x-0 z-10 flex flex-col items-center gap-3 px-4', discloseProvider ? 'bottom-[calc(3.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.75rem+env(safe-area-inset-bottom))] sm:bottom-[calc(2rem+env(safe-area-inset-bottom))]')}>
            {canRecover && <button onClick={() => void recover()} disabled={controlPending} data-testid="button-retry-voice"
              className="flex items-center gap-2 rounded-full border border-primary/30 bg-[#04030B]/85 px-5 py-2.5 text-sm text-primary transition hover:bg-primary/10 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <RotateCw className={cn('h-4 w-4', controlPending && 'motion-safe:animate-spin')} strokeWidth={1.5} /> {controlPending ? 'Recovering…' : recoveryLabel}
            </button>}
            <div className="flex flex-col items-center justify-center gap-2.5">
              {connection?.setMuted && <button onClick={() => void changeMute()} disabled={controlPending}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={muted} title={muted ? 'Unmute microphone' : 'Mute microphone'}
                data-testid="button-mute-voice"
                className={cn('grid h-11 w-11 place-items-center rounded-full border transition disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', muted ? 'border-amber-300/35 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-white/[.035] text-white/65 hover:border-primary/30 hover:text-primary')}>
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>}
              {connection?.interrupt && !failure && (transportState === 'speaking' || transportState === 'thinking') && <button onClick={() => void interrupt()}
                aria-label="Stop spoken response" title="Stop spoken response" data-testid="button-interrupt-voice"
                className="flex h-11 items-center gap-2 rounded-full border border-primary/25 bg-primary/[.06] px-4 text-xs text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <Square className="h-3 w-3 fill-current" /> Stop
              </button>}
              <button onClick={onClose} data-testid="button-end-voice"
                className="flex h-11 items-center gap-2.5 rounded-full border border-white/10 bg-white/[.035] px-5 text-[13px] text-white/60 backdrop-blur transition hover:border-rose-400/30 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70" /> {available ? 'End voice' : 'Continue in chat'}
              </button>
            </div>
          </div>
          <div className="absolute inset-x-5 bottom-[calc(.5rem+env(safe-area-inset-bottom))] z-10 text-center" data-testid="status-voice-session">
            <div className="flex items-center justify-center gap-1.5 font-mono text-[8px] uppercase tracking-[.2em] text-white/25">
              {available && <Volume2 className="h-2.5 w-2.5" />}
              {available ? native ? 'AgentPlace native voice · shared consultation' : 'Voice · shared consultation' : 'No audio connection'}
            </div>
            {discloseProvider && <p className="mx-auto mt-1 max-w-md text-[10px] leading-relaxed text-white/40">Microphone audio is processed by the configured speech provider.</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
