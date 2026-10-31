import {
  ConversationVoiceController, type ConsultationRuntime, type TurnInput,
  type VoiceAdapter, type VoiceEvent, SPECIALISTS, getSpecialistProfile, isSpecialistId, normalizeSpecialist,
} from '@workspace/consultation';
import { PcmPlayer } from './pcm-player';

interface SpeechToken { token: string; region: string; expiresAt: number }
const pendingKey = (id: number) => `syntra.development.voice.pending.v1:${id}`;

function readPending(id: number): TurnInput | undefined {
  const raw = sessionStorage.getItem(pendingKey(id));
  if (!raw) return;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('The saved voice request could not be recovered. Continue with the saved text conversation.');
  const v = value as Partial<TurnInput>;
  if (typeof v.content !== 'string' || !v.content.trim() || v.content.length > 12000 ||
      typeof v.requestId !== 'string' || !/^[\w-]{8,100}$/.test(v.requestId) ||
      !['concise', 'detailed', 'deep_dive'].includes(v.depth ?? '') ||
      (v.specialist !== undefined && !isSpecialistId(v.specialist))) throw new Error('The saved voice request is invalid. Continue with the saved text conversation.');
  return v as TurnInput;
}

/** No subscription key ever enters the browser. The server checks consultation ownership. */
async function tokenFor(id: number, signal: AbortSignal): Promise<SpeechToken> {
  const response = await fetch('/api/voice/token', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', 'X-Syntra-Voice': '1' },
    body: JSON.stringify({ conversationId: id }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Voice could not connect. Please try again.');
  }
  const result = await response.json() as SpeechToken;
  if (!result.token || !/^[a-z][a-z0-9]{1,31}$/.test(result.region) || !Number.isFinite(result.expiresAt)) throw new Error('Voice authorization was incomplete.');
  return result;
}

function spokenText(text: string) {
  return text.replace(/```[\s\S]*?```/g, 'The code example is available in your transcript.')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/(?:^|\n)\s*#{1,6}\s+/g, '\n')
    .replace(/[*_`]/g, '').trim();
}

/** Replit-only speech transport. AgentPlace uses its injected native VoiceAdapter. */
export function createAzureVoiceAdapter(runtime: Pick<ConsultationRuntime, 'messages'>): VoiceAdapter {
  return {
    available: import.meta.env.VITE_SYNTRA_VOICE_PROVIDER === 'azure',
    specialists: SPECIALISTS.map(profile => profile.id),
    async connect(id, onEvent, outerSignal, options) {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('This browser does not support microphone conversations. Continue in text.');
      if (outerSignal.aborted) throw new DOMException('Voice closed.', 'AbortError');
      const lifetime = new AbortController();
      let closed = false, muted = false;
      let frame = 0, tokenTimer = 0, silenceTimer = 0;
      let microphone: MediaStream | undefined;
      let audio: AudioContext | undefined;
      let player: PcmPlayer | undefined;
      let inputNode: MediaStreamAudioSourceNode | undefined;
      let inputMeter: AnalyserNode | undefined;
      let controller: ConversationVoiceController | undefined;
      let recognizer: import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer | undefined;
      let inputConfig: import('microsoft-cognitiveservices-speech-sdk').AudioConfig | undefined;
      let cancelSynthesis: (() => void) | undefined;
      let token: SpeechToken;
      let state = 'connecting';
      let specialist = normalizeSpecialist(options?.specialist);
      let pendingId: string | undefined;
      let finalizedAt = 0;
      let spokenTurnTiming: { finalizedAt: number; modelStartedAt: number; modelEndedAt: number } | undefined;
      const measure = (name: string, start: number) => {
        if (!start) return;
        // Local timings only: no transcript, account identifier, audio or external telemetry.
        try {
          performance.clearMeasures(name);
          performance.measure(name, { start, end: performance.now() });
        } catch { /* optional diagnostics */ }
      };
      const emit = (event: VoiceEvent) => {
        if (closed || outerSignal.aborted) return;
        if (event.type === 'state') state = event.state;
        onEvent(event);
      };
      const stopPlayback = () => { cancelSynthesis?.(); player?.stop(); };
      const close = () => {
        if (closed) return;
        closed = true;
        lifetime.abort();
        outerSignal.removeEventListener('abort', close);
        window.clearTimeout(tokenTimer); window.clearTimeout(silenceTimer); cancelAnimationFrame(frame);
        controller?.close(); stopPlayback();
        // Stop real capture immediately, without waiting for provider acknowledgement.
        microphone?.getTracks().forEach(track => track.stop());
        try { recognizer?.close(); } catch { /* already closed */ }
        try { inputConfig?.close(); } catch { /* already closed */ }
        inputNode?.disconnect(); inputMeter?.disconnect(); player?.dispose();
        void audio?.close().catch(() => {});
      };
      const fail = (message: string) => {
        if (closed || outerSignal.aborted) return;
        close();
        onEvent({ type: 'error', message });
      };
      const activity = () => {
        window.clearTimeout(silenceTimer);
        silenceTimer = window.setTimeout(() => {
          if (state === 'thinking' || state === 'speaking') activity();
          else fail('Voice paused after a few quiet minutes. Reconnect whenever you are ready.');
        }, 180_000);
      };
      outerSignal.addEventListener('abort', close, { once: true });
      try {
        emit({ type: 'state', state: 'connecting' });
        // Load SDK only after explicit voice entry; ordinary chat does not download it.
        const sdk = await import('microsoft-cognitiveservices-speech-sdk');
        sdk.SpeechRecognizer.enableTelemetry(false);
        token = await tokenFor(id, lifetime.signal);
        const restored = readPending(id);
        pendingId = restored?.requestId;
        // A recovered intent retains its original specialist as well as its request ID.
        if (restored) specialist = normalizeSpecialist(restored.specialist);
        emit({ type: 'specialist', specialist });
        microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
        if (closed || outerSignal.aborted) { microphone.getTracks().forEach(track => track.stop()); throw new DOMException('Voice closed.', 'AbortError'); }
        audio = new AudioContext();
        // Some browsers need the explicit replay button to unlock output after permission.
        void audio.resume().catch(() => {});
        player = new PcmPlayer(audio);
        inputNode = audio.createMediaStreamSource(microphone);
        inputMeter = audio.createAnalyser(); inputMeter.fftSize = 512;
        inputNode.connect(inputMeter);
        const config = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
        config.speechRecognitionLanguage = 'en-GB';
        config.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '500');
        inputConfig = sdk.AudioConfig.fromStreamInput(microphone);
        recognizer = new sdk.SpeechRecognizer(config, inputConfig);

        const speak = async (text: string, signal: AbortSignal, onStart: () => void) => {
          if (signal.aborted || closed) return;
          const spoken = spokenText(text);
          if (!spoken) throw new Error('This reply has no speakable text. Read it in the transcript.');
          const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
          speechConfig.speechSynthesisVoiceName = getSpecialistProfile(specialist).voiceId;
          speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
          // Null output disables SDK-owned playback. We own every audible sample.
          const synthesis = new sdk.SpeechSynthesizer(speechConfig, null as unknown as import('microsoft-cognitiveservices-speech-sdk').AudioConfig);
          const timing = spokenTurnTiming;
          const speechStartedAt = performance.now();
          const playback = player!.begin(() => {
            activity();
            measure('syntra.voice.synthesis-to-audio', speechStartedAt);
            if (timing) measure('syntra.voice.final-transcript-to-audio', timing.finalizedAt);
            onStart();
          });
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const timeout = window.setTimeout(() => finish(new Error('Speech playback timed out.')), 180_000);
            const abort = () => finish(new DOMException('Playback interrupted.', 'AbortError'));
            const finish = (error?: Error) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeout); signal.removeEventListener('abort', abort);
              if (cancelSynthesis === abort) cancelSynthesis = undefined;
              if (error) player!.stop();
              try { synthesis.close(); } catch { /* already closed */ }
              error ? reject(error) : resolve();
            };
            cancelSynthesis = abort;
            signal.addEventListener('abort', abort, { once: true });
            synthesis.synthesizing = (_sender, event) => {
              if (settled || signal.aborted || closed) return;
              try { player!.append(event.result.audioData); } catch (error) { finish(error instanceof Error ? error : new Error('Audio could not play.')); }
            };
            try {
              synthesis.speakTextAsync(spoken, result => {
                if (settled) return;
                if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) { finish(new Error('Speech synthesis failed.')); return; }
                try { player!.end(); }
                catch (error) { finish(error instanceof Error ? error : new Error('Speech returned no playable audio.')); return; }
                void playback.then(() => { if (!settled) activity(); finish(); });
              }, () => finish(new Error('Speech synthesis failed.')));
            } catch { finish(new Error('Speech synthesis could not start.')); }
            if (signal.aborted || closed) abort();
          });
        };
        controller = new ConversationVoiceController({
          async send(input) {
            const started = performance.now();
            const turnFinalizedAt = finalizedAt;
            const reply = await runtime.messages.send(id, input);
            measure('syntra.voice.model-response', started);
            spokenTurnTiming = { finalizedAt: turnFinalizedAt, modelStartedAt: started, modelEndedAt: performance.now() };
            return reply;
          }, speak, stopPlayback, emit,
          getDepth: () => options?.depth ?? 'detailed', getSpecialist: () => specialist, pendingTurn: restored,
          onPendingChange: input => {
            if (input) {
              sessionStorage.setItem(pendingKey(id), JSON.stringify(input));
              pendingId = input.requestId;
            } else {
              const current = readPending(id);
              if (current?.requestId === pendingId) sessionStorage.removeItem(pendingKey(id));
              pendingId = undefined;
            }
          },
        }, { endOfTurnDelayMs: 350 });

        recognizer.speechStartDetected = () => { if (!muted && !closed) { activity(); controller!.speechStarted(); } };
        recognizer.speechEndDetected = () => { if (!muted && !closed) controller!.speechEnded(); };
        recognizer.recognizing = (_sender, event) => {
          if (!muted && !closed && event.result.text) { activity(); controller!.interim(event.result.resultId, event.result.text); }
        };
        recognizer.recognized = (_sender, event) => {
          if (closed || muted) return;
          if (event.result.reason === sdk.ResultReason.RecognizedSpeech) { activity(); finalizedAt = performance.now(); controller!.final(event.result.resultId, event.result.text); }
          else controller!.speechEnded();
        };
        recognizer.canceled = () => fail('The speech connection stopped. Your project is saved; reconnect to continue.');
        recognizer.sessionStopped = () => fail('The speech session ended. Reconnect to continue with the same project.');
        await new Promise<void>((resolve, reject) => {
          const abort = () => finish(new DOMException('Voice closed.', 'AbortError'));
          const timer = window.setTimeout(() => finish(new Error('The speech connection timed out. Please reconnect.')), 15_000);
          let settled = false;
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true; window.clearTimeout(timer); lifetime.signal.removeEventListener('abort', abort);
            error ? reject(error) : resolve();
          };
          lifetime.signal.addEventListener('abort', abort, { once: true });
          try { recognizer!.startContinuousRecognitionAsync(() => finish(), () => finish(new Error('The microphone could not connect to the speech service.'))); }
          catch { finish(new Error('The speech connection could not start.')); }
          if (lifetime.signal.aborted) abort();
        });
        if (closed) throw new DOMException('Voice closed.', 'AbortError');

        const refreshToken = async () => {
          try {
            token = await tokenFor(id, lifetime.signal);
            if (closed) return;
            recognizer!.authorizationToken = token.token;
            tokenTimer = window.setTimeout(() => void refreshToken(), Math.max(10_000, token.expiresAt - Date.now() - 120_000));
          } catch { if (!closed) fail('Voice authorization could not be renewed. Reconnect to continue.'); }
        };
        tokenTimer = window.setTimeout(() => void refreshToken(), Math.max(10_000, token.expiresAt - Date.now() - 120_000));
        const input = new Float32Array(inputMeter.fftSize);
        const output = new Float32Array(player.analyser.fftSize);
        const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        let voicedAt = 0, quietAt = 0, localSpeech = false;
        const meter = (time: number) => {
          if (closed) return;
          inputMeter!.getFloatTimeDomainData(input); player!.analyser.getFloatTimeDomainData(output);
          const inputLevel = muted ? 0 : rms(input);
          emit({ type: 'amplitude', value: Math.min(1, Math.max(inputLevel, rms(output)) * 6) });
          // Local onset stops owned audio without a network round trip. Provider VAD
          // still owns transcripts; sustained energy plus echo cancellation reduces echo triggers.
          if (!muted && inputLevel > 0.035) {
            quietAt = 0; voicedAt ||= time;
            if (!localSpeech && state === 'speaking' && time - voicedAt > 140) { localSpeech = true; activity(); controller!.speechStarted(); }
          } else {
            voicedAt = 0; quietAt ||= time;
            if (localSpeech && time - quietAt > 350) { localSpeech = false; controller!.speechEnded(); }
          }
          frame = requestAnimationFrame(meter);
        };
        frame = requestAnimationFrame(meter); activity();
        if (!restored) emit({ type: 'state', state: 'listening' });
        return {
          close, interrupt: () => controller!.interrupt(),
          canSwitchSpecialist: () => !closed && controller!.canSwitchSpecialist(),
          setSpecialist(next) {
            const selected = normalizeSpecialist(next);
            if (closed) throw new Error('Reconnect before choosing a specialist.');
            if (!controller!.canSwitchSpecialist()) throw new Error('Finish or recover the current turn before switching specialists.');
            controller!.interrupt();
            specialist = selected;
            emit({ type: 'specialist', specialist });
            activity();
          },
          setMuted(value: boolean) {
            muted = value;
            microphone!.getAudioTracks().forEach(track => { track.enabled = !muted; });
            if (muted) { localSpeech = false; voicedAt = 0; controller!.speechEnded(); }
            activity();
          },
          retryTurn: () => controller!.retryTurn(),
          async retryPlayback() { await audio!.resume(); controller!.retryPlayback(); },
        };
      } catch (error) {
        close();
        if (error instanceof DOMException && error.name === 'NotAllowedError') throw new Error('Microphone access was not allowed. Allow it in your browser or continue in text.');
        throw error;
      }
    },
  };
}
