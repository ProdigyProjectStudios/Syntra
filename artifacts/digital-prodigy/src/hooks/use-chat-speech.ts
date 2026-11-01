import { useEffect, useRef, useState } from 'react';

/** Owns only chat audio. No message is sent until the visitor presses Send. */
export function useChatSpeech(ensureConversation: () => Promise<number>, voiceName: string, scope: number | null) {
  const [mode, setMode] = useState<'idle' | 'loading' | 'dictating' | 'playing'>('idle');
  const [error, setError] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const release = useRef<() => void>(() => {});
  const finishDictation = useRef<(() => void) | null>(null);
  const stop = () => {
    lifetime.current?.abort(); lifetime.current = null;
    release.current(); release.current = () => {}; finishDictation.current = null;
    setMode('idle');
  };
  useEffect(() => () => { lifetime.current?.abort(); release.current(); }, []);
  // Starting the first recording creates a conversation; only stop on a later session switch.
  const previousScope = useRef(scope);
  useEffect(() => {
    if (previousScope.current !== null && previousScope.current !== scope) stop();
    previousScope.current = scope;
  }, [scope]);

  async function begin(kind: 'dictating' | 'playing', text: string, onText?: (value: string) => void) {
    stop(); setError(''); setMode('loading');
    const controller = new AbortController(); lifetime.current = controller;
    const valid = () => !controller.signal.aborted;
    const fail = (message: string) => { if (valid()) { stop(); setError(message); } };
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    release.current = () => { stream?.getTracks().forEach(track => track.stop()); clearTimeout(timer); };
    try {
      if (import.meta.env.VITE_SYNTRA_VOICE_PROVIDER !== 'azure') throw new Error('Chat speech requires the configured Azure voice service in Replit.');
      if (kind === 'dictating') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!valid()) { stream.getTracks().forEach(track => track.stop()); return; }
      }
      const [sdk, auth] = await Promise.all([
        import('microsoft-cognitiveservices-speech-sdk'),
        ensureConversation().then(async id => (await import('@/lib/development-voice/azure-voice')).tokenFor(id, controller.signal)),
      ]);
      if (!valid()) return;
      const config = sdk.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
      config.speechRecognitionLanguage = 'en-GB'; config.speechSynthesisVoiceName = voiceName;
      if (kind === 'dictating') {
        const input = sdk.AudioConfig.fromStreamInput(stream!);
        const recognizer = new sdk.SpeechRecognizer(config, input);
        let committed = text.trim();
        release.current = () => { clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); recognizer.close(); input.close(); };
        recognizer.recognizing = (_, event) => { if (valid()) onText?.([committed, event.result.text].filter(Boolean).join(' ').slice(0, 12000)); };
        recognizer.recognized = (_, event) => {
          if (!valid() || event.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
          committed = [committed, event.result.text].filter(Boolean).join(' ').slice(0, 12000); onText?.(committed);
        };
        recognizer.canceled = () => fail('Dictation stopped. Check microphone permission and try again; your draft is preserved.');
        recognizer.sessionStopped = () => { if (valid()) stop(); };
        finishDictation.current = () => recognizer.stopContinuousRecognitionAsync(() => { if (valid()) stop(); }, () => fail('Could not finish dictation. Your draft is preserved.'));
        recognizer.startContinuousRecognitionAsync(() => {
          if (!valid()) return;
          setMode('dictating'); timer = setTimeout(() => finishDictation.current?.(), 120000);
        }, () => fail('Could not start dictation. Check microphone permission and try again.'));
      } else {
        const speaker = new sdk.SpeakerAudioDestination();
        const output = sdk.AudioConfig.fromSpeakerOutput(speaker);
        const synth = new sdk.SpeechSynthesizer(config, output);
        release.current = () => { clearTimeout(timer); speaker.pause(); synth.close(); speaker.close(); output.close(); };
        speaker.onAudioEnd = () => { if (valid()) stop(); };
        speaker.onAudioStart = () => { if (valid()) setMode('playing'); };
        timer = setTimeout(() => fail('Playback timed out. Please try again.'), 180000);
        const spoken = text.replace(/```[\s\S]*?```/g, 'The code example is in the chat.').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`#]/g, '');
        synth.speakTextAsync(spoken, result => {
          if (result.reason === sdk.ResultReason.Canceled) fail('Playback could not start. Please try again.');
        }, () => fail('Playback failed. Please try again.'));
      }
    } catch (cause) {
      fail(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Allow microphone access to dictate. Your draft is preserved.' : cause instanceof Error ? cause.message : 'Speech is unavailable. Please try again.');
    }
  }
  return { mode, error, stop, finish: () => finishDictation.current ? finishDictation.current() : stop(),
    dictate: (draft: string, onText: (value: string) => void) => void begin('dictating', draft, onText),
    play: (text: string) => void begin('playing', text) };
}
