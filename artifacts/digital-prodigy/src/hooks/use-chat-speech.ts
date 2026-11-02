import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createAudioPreparation } from '../lib/development-voice/audio-preparation.ts';
import { playChatReply } from '../lib/development-voice/chat-playback.ts';

/** Owns only chat audio. No message is sent until the visitor presses Send. */
export function useChatSpeech(ensureConversation: () => Promise<number>, voiceName: string, scope: number | null, suspended = false) {
  const [mode, setMode] = useState<'idle' | 'loading' | 'dictating' | 'playing'>('idle');
  const [error, setError] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const release = useRef<() => void>(() => {});
  const finishDictation = useRef<(() => void) | null>(null);
  const authorization = useRef<{ id: number; token: string; region: string; expiresAt: number } | null>(null);
  const stop = () => {
    lifetime.current?.abort(); lifetime.current = null;
    const cleanup = release.current;
    release.current = () => {}; finishDictation.current = null;
    try { cleanup(); } catch { /* Cancellation must still restore the controls. */ }
    setMode('idle');
  };
  useEffect(() => () => { lifetime.current?.abort(); release.current(); }, []);
  // Every voice entry path must release chat capture before the voice console connects.
  useLayoutEffect(() => {
    if (suspended) stop();
  }, [suspended]);
  // Starting the first recording creates a conversation; only stop on a later session switch.
  const previousScope = useRef(scope);
  useEffect(() => {
    if (previousScope.current !== null && previousScope.current !== scope) { stop(); authorization.current = null; }
    previousScope.current = scope;
  }, [scope]);

  async function begin(kind: 'dictating' | 'playing', text: string, onText?: (value: string) => void) {
    if (suspended) return;
    stop(); setError(''); setMode('loading');
    const controller = new AbortController(); lifetime.current = controller;
    const valid = () => !controller.signal.aborted;
    const fail = (message: string) => { if (valid()) { stop(); setError(message); } };
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let context: AudioContext | undefined;
    const preparation = createAudioPreparation();
    release.current = () => { stream?.getTracks().forEach(track => track.stop()); clearTimeout(timer); };
    try {
      if (import.meta.env.VITE_SYNTRA_VOICE_PROVIDER !== 'azure') throw new Error('Chat speech requires the configured Azure voice service in Replit.');
      // Unlock output inside the original click, before SDK/session/token awaits.
      if (kind === 'playing') preparation.prepare(controller.signal);
      timer = setTimeout(() => fail('Speech could not connect. Please try again; your draft is preserved.'), 45000);
      if (kind === 'dictating') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone dictation requires HTTPS and a browser with microphone support.');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!valid()) { stream.getTracks().forEach(track => track.stop()); return; }
      }
      const [sdk, auth] = await Promise.all([
        import('microsoft-cognitiveservices-speech-sdk'),
        ensureConversation().then(async id => {
          if (!valid()) throw new DOMException('Speech cancelled.', 'AbortError');
          const cached = authorization.current;
          if (cached?.id === id && cached.expiresAt > Date.now() + 60000) return cached;
          const token = await (await import('@/lib/development-voice/azure-voice')).tokenFor(id, controller.signal);
          if (valid()) authorization.current = { id, ...token };
          return token;
        }),
      ]);
      if (!valid()) return;
      const config = sdk.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
      config.speechRecognitionLanguage = 'en-GB'; config.speechSynthesisVoiceName = voiceName;
      if (kind === 'dictating') {
        const input = sdk.AudioConfig.fromStreamInput(stream!);
        const recognizer = new sdk.SpeechRecognizer(config, input);
        let committed = text.trim();
        release.current = () => {
          clearTimeout(timer); stream?.getTracks().forEach(track => track.stop());
          try { recognizer.close(); } catch { /* Continue releasing input. */ }
          try { input.close(); } catch { /* Capture tracks are already stopped. */ }
        };
        recognizer.recognizing = (_, event) => { if (valid()) onText?.([committed, event.result.text].filter(Boolean).join(' ').slice(0, 12000)); };
        recognizer.recognized = (_, event) => {
          if (!valid() || event.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
          committed = [committed, event.result.text].filter(Boolean).join(' ').slice(0, 12000); onText?.(committed);
        };
        recognizer.canceled = () => fail('Dictation stopped. Check microphone permission and try again; your draft is preserved.');
        recognizer.sessionStopped = () => { if (valid()) stop(); };
        finishDictation.current = () => {
          clearTimeout(timer);
          // Release the physical mic immediately; let Azure drain its final phrase briefly.
          stream?.getTracks().forEach(track => track.stop());
          timer = setTimeout(() => { if (valid()) stop(); }, 2000);
          recognizer.stopContinuousRecognitionAsync(() => { if (valid()) stop(); }, () => fail('Could not finish dictation. Your draft is preserved.'));
        };
        recognizer.startContinuousRecognitionAsync(() => {
          if (!valid()) return;
          clearTimeout(timer); setMode('dictating'); timer = setTimeout(() => finishDictation.current?.(), 120000);
        }, () => fail('Could not start dictation. Check microphone permission and try again.'));
      } else {
        context = preparation.take();
        if (!context) throw new Error('Audio playback is not supported in this browser.');
        let closePlayback = () => {};
        release.current = () => {
          clearTimeout(timer); closePlayback();
          try { void context?.close().catch(() => {}); } catch { /* Already released. */ }
        };
        await context.resume();
        if (!valid()) return;
        clearTimeout(timer);
        timer = setTimeout(() => fail('Playback timed out. Please try again.'), 180000);
        const spoken = text.replace(/```[\s\S]*?```/g, 'The code example is in the chat.').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`#]/g, '');
        closePlayback = playChatReply(sdk, config, context, spoken, controller.signal,
          () => { if (valid()) setMode('playing'); }, () => { if (valid()) stop(); },
          () => fail('Playback failed. Please try again.'));
      }
    } catch (cause) {
      fail(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Allow microphone access to dictate. Your draft is preserved.' : cause instanceof Error ? cause.message : 'Speech is unavailable. Please try again.');
    }
  }
  return { mode, error, stop, finish: () => finishDictation.current ? finishDictation.current() : stop(),
    dictate: (draft: string, onText: (value: string) => void) => void begin('dictating', draft, onText),
    play: (text: string) => void begin('playing', text) };
}
