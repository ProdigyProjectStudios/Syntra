import {
  ConversationVoiceController, type ConsultationRuntime, type TurnInput,
  type VoiceAdapter, type VoiceEvent, SPECIALISTS, getSpecialistProfile, isSpecialistId, normalizeSpecialist,
} from '@workspace/consultation';
import { PcmPlayer } from './pcm-player.ts';
import { BargeInGate } from './barge-in-gate.ts';
import { VoiceDiagnostics, type VoiceMetric } from './voice-diagnostics.ts';
import { RecognitionIdentityTracker } from './recognition-identity.ts';
import { observeSpeechConnection } from './speech-connection-diagnostics.ts';
import { createAudioPreparation } from './audio-preparation.ts';

type SpeechSdk = typeof import('microsoft-cognitiveservices-speech-sdk');
interface SpeechToken { token: string; region: string; expiresAt: number }
export interface AzureVoiceOptions {
  enabled?: boolean;
  loadSdk?: () => Promise<SpeechSdk>;
  audioPreparation?: ReturnType<typeof createAudioPreparation>;
}
const pendingKey = (id: number) => `syntra.development.voice.pending.v1:${id}`;
const aborted = () => new DOMException('Voice closed.', 'AbortError');

function release(work: () => unknown) {
  try {
    const result = work();
    if (result instanceof Promise) void result.catch(() => {});
  } catch { /* Continue releasing the other independently owned resources. */ }
}
function stopStream(stream: MediaStream | undefined) {
  stream?.getTracks().forEach(track => { if (track.readyState !== 'ended') release(() => track.stop()); });
}
/** Browser permission requests cannot be canceled; release a late grant without adopting it. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal, releaseLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', abort); reject(signal.reason ?? aborted());
    };
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(value => {
      if (settled) { releaseLate?.(value); return; }
      settled = true; signal.removeEventListener('abort', abort); resolve(value);
    }, error => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', abort); reject(error);
    });
    if (signal.aborted) abort();
  });
}

function readPending(id: number): TurnInput | undefined {
  const raw = sessionStorage.getItem(pendingKey(id));
  if (!raw) return;
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('The saved voice request could not be recovered. Continue with the saved text conversation.'); }
  if (!value || typeof value !== 'object') throw new Error('The saved voice request could not be recovered. Continue with the saved text conversation.');
  const v = value as Partial<TurnInput>;
  if (typeof v.content !== 'string' || !v.content.trim() || v.content.length > 12000 ||
      typeof v.requestId !== 'string' || !/^[\w-]{8,100}$/.test(v.requestId) ||
      !['concise', 'detailed', 'deep_dive'].includes(v.depth ?? '') ||
      (v.specialist !== undefined && !isSpecialistId(v.specialist))) throw new Error('The saved voice request is invalid. Continue with the saved text conversation.');
  return v as TurnInput;
}

/** The server checks consultation ownership. A stalled token request cannot hold voice open. */
async function tokenFor(id: number, signal: AbortSignal): Promise<SpeechToken> {
  const requestLifetime = new AbortController();
  const abort = () => requestLifetime.abort(signal.reason ?? aborted());
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => requestLifetime.abort(new Error('Voice authorization timed out. Please reconnect.')), 15_000);
  if (signal.aborted) abort();
  try {
    return await abortable((async () => {
      const response = await fetch('/api/voice/token', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: requestLifetime.signal,
        headers: { 'Content-Type': 'application/json', 'X-Syntra-Voice': '1' },
        body: JSON.stringify({ conversationId: id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : 'Voice could not connect. Please try again.');
      }
      const result = await response.json() as SpeechToken;
      if (!result.token || !/^[a-z][a-z0-9]{1,31}$/.test(result.region) ||
          !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) throw new Error('Voice authorization was incomplete or expired.');
      return result;
    })(), requestLifetime.signal);
  } finally {
    window.clearTimeout(timeout); signal.removeEventListener('abort', abort);
  }
}

function spokenText(text: string) {
  return text.replace(/```[\s\S]*?```/g, 'The code example is available in your transcript.')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/(?:^|\n)\s*#{1,6}\s+/g, '\n')
    .replace(/[*_`]/g, '').trim();
}

/** Replit-only transport. AgentPlace continues to inject its own native VoiceAdapter. */
export function createAzureVoiceAdapter(runtime: Pick<ConsultationRuntime, 'messages'>, adapterOptions: AzureVoiceOptions = {}): VoiceAdapter {
  let activeClose: (() => void) | undefined;
  let pendingCapture: Promise<MediaStream> | undefined;
  let pendingRetirement = Promise.resolve();
  const audioPreparation = adapterOptions.audioPreparation ?? createAudioPreparation();
  return {
    prepare: audioPreparation.prepare,
    available: adapterOptions.enabled ?? import.meta.env?.VITE_SYNTRA_VOICE_PROVIDER === 'azure',
    specialists: SPECIALISTS.map(profile => profile.id),
    async connect(id, onEvent, outerSignal, options) {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('This browser does not support microphone conversations. Continue in text.');
      if (outerSignal.aborted) throw aborted();
      activeClose?.();
      if (pendingCapture) throw new Error('Finish or dismiss the existing microphone permission request, then reconnect.');
      const lifetime = new AbortController();
      const diagnostics = new VoiceDiagnostics();
      diagnostics.event('connection.open');
      const onset = new BargeInGate();
      const connectionStartedAt = performance.now();
      let closed = false, muted = false, asrActive = false;
      let frame = 0, tokenTimer = 0, silenceTimer = 0, recognitionEpoch = 0;
      let microphone: MediaStream | undefined, recognitionInput: MediaStream | undefined;
      let audio: AudioContext | undefined = audioPreparation.take();
      let player: PcmPlayer | undefined;
      let inputNode: MediaStreamAudioSourceNode | undefined, inputMeter: AnalyserNode | undefined;
      let controller: ConversationVoiceController | undefined;
      let recognizer: import('microsoft-cognitiveservices-speech-sdk').SpeechRecognizer | undefined;
      let connectionProbe: ReturnType<typeof observeSpeechConnection> | undefined;
      let inputConfig: import('microsoft-cognitiveservices-speech-sdk').AudioConfig | undefined;
      let cancelSynthesis: ((error?: Error) => void) | undefined;
      let localCandidate: { epoch: number; timer?: number } | undefined;
      let token: SpeechToken;
      let state = 'connecting';
      let specialist = normalizeSpecialist(options?.specialist);
      let pendingId: string | undefined;
      const notify = (event: VoiceEvent) => { if (!outerSignal.aborted) release(() => onEvent(event)); };
      const emit = (event: VoiceEvent) => {
        if (closed || outerSignal.aborted) return;
        if (event.type === 'state') { state = event.state; diagnostics.event('connection.state', { state }); }
        notify(event);
      };
      const stopPlayback = () => {
        const started = performance.now();
        const hadOutput = Boolean(cancelSynthesis);
        cancelSynthesis?.(); player?.stop();
        if (hadOutput) diagnostics.record('interruption-stop', performance.now() - started);
      };
      const stopRecognition = () => {
        const retiredEpoch = recognitionEpoch;
        recognitionEpoch++;
        const oldRecognizer = recognizer, oldConfig = inputConfig, oldStream = recognitionInput;
        if (oldRecognizer) diagnostics.event('recognition.retiring', { epoch: retiredEpoch });
        release(() => connectionProbe?.close()); connectionProbe = undefined;
        recognizer = undefined; inputConfig = undefined; recognitionInput = undefined;
        stopStream(oldStream);
        if (!oldRecognizer) { release(() => oldConfig?.close()); return; }
        const retirement = new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = (error?: unknown) => {
            if (settled) return;
            settled = true; release(() => oldConfig?.close());
            diagnostics.event('recognition.retired', { epoch: retiredEpoch, outcome: error ? 'failed' : 'completed' });
            error ? reject(new Error('The previous speech session could not finish closing. Reload the page before reconnecting.')) : resolve();
          };
          try { oldRecognizer.close(() => finish(), error => finish(error || new Error('Speech cleanup failed.'))); }
          catch (error) { finish(error); }
        });
        // Shared across mute/restart and whole connection replacement. Starting a second
        // SDK stream before close's callback can violate the single-stream provider quota.
        pendingRetirement = Promise.all([pendingRetirement, retirement]).then(() => {});
        void pendingRetirement.catch(() => {});
      };
      const cancelLocalCandidate = () => {
        if (localCandidate?.timer !== undefined) window.clearTimeout(localCandidate.timer);
        localCandidate = undefined;
      };
      const microphoneEnded = () => { diagnostics.event('capture.ended'); fail('The microphone disconnected or its permission was removed. Your project is saved; reconnect to continue.'); };
      const audioStateChanged = () => {
        if (closed) return;
        diagnostics.event('audio.state', { state: audio?.state });
        if (audio?.state === 'closed') fail('The audio connection closed. Your project is saved; reconnect to continue.');
        else if (audio?.state !== 'running' && cancelSynthesis) cancelSynthesis(new Error('Audio playback paused. Replay the saved response when you are ready.'));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        diagnostics.event('connection.close');
        if (activeClose === close) activeClose = undefined;
        lifetime.abort(aborted());
        outerSignal.removeEventListener('abort', close);
        window.clearTimeout(tokenTimer); window.clearTimeout(silenceTimer); cancelAnimationFrame(frame);
        cancelLocalCandidate();
        // Stop capture first, independently of any failed SDK or Web Audio cleanup.
        microphone?.getTracks().forEach(track => release(() => track.removeEventListener('ended', microphoneEnded)));
        stopStream(microphone);
        release(() => controller?.close()); release(stopPlayback); stopRecognition();
        release(() => audio?.removeEventListener('statechange', audioStateChanged));
        release(() => inputNode?.disconnect()); release(() => inputMeter?.disconnect());
        release(() => player?.dispose()); release(() => audio?.close());
        diagnostics.clear(); onset.reset();
        notify({ type: 'input', speaking: false });
        notify({ type: 'state', state: 'closed' });
      };
      const fail = (message: string) => {
        if (closed || outerSignal.aborted) return;
        diagnostics.event('connection.failed');
        close(); notify({ type: 'error', message });
      };
      const checkOpen = () => { if (closed || lifetime.signal.aborted) throw aborted(); };
      const waitForRetirement = async () => {
        const deadline = new AbortController();
        const abort = () => deadline.abort(aborted());
        lifetime.signal.addEventListener('abort', abort, { once: true });
        const timer = window.setTimeout(() => deadline.abort(new Error('The previous speech session is still closing. Wait a moment and reconnect; reload the page if this persists.')), 5_000);
        if (lifetime.signal.aborted) abort();
        try { await abortable(pendingRetirement, deadline.signal); checkOpen(); }
        finally { window.clearTimeout(timer); lifetime.signal.removeEventListener('abort', abort); }
      };
      const activity = () => {
        if (closed) return;
        window.clearTimeout(silenceTimer);
        silenceTimer = window.setTimeout(() => {
          if (state === 'thinking' || state === 'speaking') activity();
          else fail('Voice paused after a few quiet minutes. Reconnect whenever you are ready.');
        }, 180_000);
      };
      activeClose = close;
      outerSignal.addEventListener('abort', close, { once: true });
      try {
        emit({ type: 'state', state: 'connecting' });
        const restored = readPending(id);
        pendingId = restored?.requestId;
        if (restored) specialist = normalizeSpecialist(restored.specialist);
        emit({ type: 'specialist', specialist });
        await waitForRetirement();
        const sdk = await abortable((adapterOptions.loadSdk ?? (() => import('microsoft-cognitiveservices-speech-sdk')))(), lifetime.signal);
        checkOpen(); sdk.SpeechRecognizer.enableTelemetry(false);
        token = await tokenFor(id, lifetime.signal); checkOpen();
        diagnostics.event('authorization.ready');
        diagnostics.event('capture.requested');
        const request = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
        pendingCapture = request;
        void request.then(() => { if (pendingCapture === request) pendingCapture = undefined; }, () => { if (pendingCapture === request) pendingCapture = undefined; });
        microphone = await abortable<MediaStream>(request, lifetime.signal, stopStream);
        if (closed || lifetime.signal.aborted) stopStream(microphone);
        checkOpen();
        if (!microphone.getAudioTracks().some(track => track.readyState === 'live')) throw new Error('No active microphone was available. Reconnect or continue in text.');
        diagnostics.event('capture.ready', { liveTracks: microphone.getAudioTracks().filter(track => track.readyState === 'live').length });
        microphone.getTracks().forEach(track => track.addEventListener('ended', microphoneEnded));
        audio ??= new window.AudioContext();
        audio.addEventListener('statechange', audioStateChanged);
        diagnostics.event('audio.state', { state: audio.state });
        // A suspended context must not masquerade as a listening/playable session.
        // resume() can remain pending under autoplay policy, so bound it independently.
        const audioDeadline = new AbortController();
        const cancelAudio = () => audioDeadline.abort(aborted());
        lifetime.signal.addEventListener('abort', cancelAudio, { once: true });
        const audioTimer = window.setTimeout(() => audioDeadline.abort(new Error('Audio needs a browser gesture. Select Reconnect to enable your microphone and speaker.')), 5_000);
        try {
          await abortable(audio.resume(), audioDeadline.signal);
          checkOpen();
          if (audio.state !== 'running') throw new Error('Audio could not start. Select Reconnect to enable your microphone and speaker.');
        } catch {
          if (lifetime.signal.aborted) throw aborted();
          if (audioDeadline.signal.aborted) throw audioDeadline.signal.reason;
          throw new Error('Audio could not start. Select Reconnect to enable your microphone and speaker.');
        } finally {
          window.clearTimeout(audioTimer); lifetime.signal.removeEventListener('abort', cancelAudio);
        }
        player = new PcmPlayer(audio);
        inputNode = audio.createMediaStreamSource(microphone);
        inputMeter = audio.createAnalyser(); inputMeter.fftSize = 512;
        inputNode.connect(inputMeter);

        const resultMetric = (properties: import('microsoft-cognitiveservices-speech-sdk').PropertyCollection | undefined, property: number, metric: VoiceMetric) => {
          const value = properties?.getProperty(property);
          if (value !== undefined && value !== '') diagnostics.record(metric, Number(value));
        };
        const speak = async (text: string, signal: AbortSignal, onStart: () => void) => {
          if (signal.aborted || closed) return;
          const spoken = spokenText(text);
          if (!spoken) throw new Error('This reply has no speakable text. Read it in the transcript.');
          const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
          speechConfig.speechSynthesisVoiceName = getSpecialistProfile(specialist).voiceId;
          speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
          const synthesis = new sdk.SpeechSynthesizer(speechConfig, null as unknown as import('microsoft-cognitiveservices-speech-sdk').AudioConfig);
          const speechStartedAt = performance.now();
          diagnostics.event('synthesis.start');
          const playback = player!.begin(() => {
            activity();
            diagnostics.event('playback.first-scheduled');
            diagnostics.record('synthesis-to-audio', performance.now() - speechStartedAt);
            onStart();
          });
          await new Promise<void>((resolve, reject) => {
            let settled = false, receivedAudio = false;
            const timeout = window.setTimeout(() => finish(new Error('Speech playback timed out.')), 180_000);
            const abort = (error = new DOMException('Playback interrupted.', 'AbortError')) => finish(error);
            const signalAbort = () => abort();
            const finish = (error?: Error) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeout); signal.removeEventListener('abort', signalAbort);
              if (cancelSynthesis === abort) cancelSynthesis = undefined;
              if (error) diagnostics.event(error.name === 'AbortError' ? 'playback.stopped' : 'synthesis.failed');
              if (error) release(() => player!.stop());
              release(() => synthesis.close(() => {}, () => {}));
              error ? reject(error) : resolve();
            };
            cancelSynthesis = abort;
            signal.addEventListener('abort', signalAbort, { once: true });
            synthesis.synthesizing = (_sender, event) => {
              if (settled || signal.aborted || closed) return;
              if (!receivedAudio && event.result.audioData.byteLength) {
                receivedAudio = true; diagnostics.event('synthesis.first-chunk');
              }
              try { player!.append(event.result.audioData); }
              catch (error) { finish(error instanceof Error ? error : new Error('Audio could not play.')); }
            };
            try {
              synthesis.speakTextAsync(spoken, result => {
                if (settled || signal.aborted || closed) return;
                if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) { finish(new Error('Speech synthesis failed.')); return; }
                diagnostics.event('synthesis.complete');
                resultMetric(result.properties, sdk.PropertyId.SpeechServiceResponse_SynthesisFirstByteLatencyMs, 'synthesis-first-byte');
                resultMetric(result.properties, sdk.PropertyId.SpeechServiceResponse_SynthesisFinishLatencyMs, 'synthesis-finish');
                resultMetric(result.properties, sdk.PropertyId.SpeechServiceResponse_SynthesisConnectionLatencyMs, 'synthesis-connection');
                resultMetric(result.properties, sdk.PropertyId.SpeechServiceResponse_SynthesisNetworkLatencyMs, 'synthesis-network');
                resultMetric(result.properties, sdk.PropertyId.SpeechServiceResponse_SynthesisServiceLatencyMs, 'synthesis-service');
                try { player!.end(); }
                catch (error) { finish(error instanceof Error ? error : new Error('Speech returned no playable audio.')); return; }
                void playback.then(() => {
                  if (!settled && !signal.aborted && !closed) { diagnostics.event('playback.complete'); activity(); }
                  finish();
                });
              }, () => finish(new Error('Speech synthesis failed.')));
            } catch { finish(new Error('Speech synthesis could not start.')); }
            if (signal.aborted || closed) abort();
          });
        };
        controller = new ConversationVoiceController({
          async send(input) {
            const deadline = new AbortController();
            const abort = () => deadline.abort(aborted());
            lifetime.signal.addEventListener('abort', abort, { once: true });
            // The model itself has a 45s timeout and one retry. A dropped HTTP response
            // must eventually become an uncertain original intent, never a new send.
            const timer = window.setTimeout(() => deadline.abort(new Error('The response is taking longer than expected. Recover the original request before continuing.')), 120_000);
            if (lifetime.signal.aborted) abort();
            try { return await abortable(runtime.messages.send(id, input), deadline.signal); }
            finally { window.clearTimeout(timer); lifetime.signal.removeEventListener('abort', abort); }
          }, speak, stopPlayback, emit,
          getDepth: () => options?.depth ?? 'detailed', getSpecialist: () => specialist, pendingTurn: restored,
          onTurnPhase: event => diagnostics.phase(event),
          onDiagnostic: event => diagnostics.controller(event),
          onPendingChange: input => {
            if (input) { sessionStorage.setItem(pendingKey(id), JSON.stringify(input)); pendingId = input.requestId; }
            else {
              const current = readPending(id);
              if (current?.requestId === pendingId) sessionStorage.removeItem(pendingKey(id));
              pendingId = undefined;
            }
          },
        }, { endOfTurnDelayMs: 350 });

        const startRecognition = async () => {
          const requestedEpoch = recognitionEpoch;
          await waitForRetirement();
          checkOpen();
          // Mute/close/replacement may occur while the old SDK stream is retiring.
          if (muted || requestedEpoch !== recognitionEpoch) return false;
          const epoch = ++recognitionEpoch;
          const identities = new RecognitionIdentityTracker(epoch);
          const current = () => !closed && !muted && epoch === recognitionEpoch;
          const timing = (result: { offset: number; duration: number }) => ({
            offsetMs: result.offset / 10_000, durationMs: result.duration / 10_000,
          });
          // The SDK owns only its clone; retiring it cannot stop the retained capture/meter.
          recognitionInput = microphone!.clone();
          const config = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
          config.speechRecognitionLanguage = 'en-GB';
          config.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '500');
          inputConfig = sdk.AudioConfig.fromStreamInput(recognitionInput);
          const instance = new sdk.SpeechRecognizer(config, inputConfig);
          recognizer = instance;
          try {
            if (sdk.Connection?.fromRecognizer) connectionProbe = observeSpeechConnection(sdk.Connection.fromRecognizer(instance), diagnostics, epoch);
            else diagnostics.event('recognition.observer-unavailable', { epoch });
          } catch { diagnostics.event('recognition.observer-unavailable', { epoch }); }
          diagnostics.event('recognition.starting', { epoch });
          instance.speechStartDetected = () => {
            if (!current()) return;
            diagnostics.event('recognition.speech-start', { epoch });
            identities.speechStarted();
            cancelLocalCandidate(); asrActive = true;
            // Bare output-era VAD can be room/echo noise. Meaningful ASR and local onset
            // still interrupt immediately; never discard text using similarity guesses.
            if (state !== 'speaking') controller!.speechStarted();
          };
          instance.speechEndDetected = () => {
            if (current()) {
              diagnostics.event('recognition.speech-end', { epoch });
              cancelLocalCandidate(); asrActive = false; controller!.speechEnded();
            }
          };
          instance.recognizing = (_sender, event) => {
            if (!current()) { diagnostics.event('recognition.stale', { epoch }); return; }
            if (!event.result.text.trim()) return;
            const identity = identities.interim(event.result);
            diagnostics.event(identity.duplicate ? 'recognition.duplicate' : 'recognition.interim', {
              epoch, utterance: identity.sequence, timingAvailable: identity.timingAvailable,
              reusedProviderId: identity.reusedProviderId, ...timing(event.result),
            });
            if (identity.duplicate) return;
            cancelLocalCandidate(); activity(); asrActive = true; controller!.interim(identity.id, event.result.text);
          };
          instance.recognized = (_sender, event) => {
            if (!current()) { diagnostics.event('recognition.stale', { epoch }); return; }
            if (event.result.reason !== sdk.ResultReason.RecognizedSpeech && event.result.reason !== sdk.ResultReason.NoMatch) return;
            const identity = identities.terminal(event.result);
            const hasSpeech = event.result.reason === sdk.ResultReason.RecognizedSpeech && Boolean(event.result.text.trim());
            if (identity.ambiguous) {
              diagnostics.event('recognition.ambiguous', { epoch, utterance: identity.sequence });
              restoreRecognition('That phrase could not be confirmed. Please repeat it.');
              return;
            }
            diagnostics.event(identity.duplicate ? 'recognition.duplicate' : hasSpeech ? 'recognition.final' : 'recognition.no-match', {
              epoch, utterance: identity.sequence, timingAvailable: identity.timingAvailable,
              reusedProviderId: identity.reusedProviderId, ...timing(event.result),
            });
            if (identity.duplicate) return;
            cancelLocalCandidate(); asrActive = identities.awaitingFinal;
            resultMetric(event.result.properties, sdk.PropertyId.SpeechServiceResponse_RecognitionLatencyMs, 'recognition-sdk');
            if (hasSpeech) {
              if (controller!.final(identity.id, event.result.text)) activity();
            }
            else controller!.noMatch(identity.id);
          };
          instance.canceled = (_sender, event) => {
            if (current()) {
              diagnostics.event('recognition.canceled', { epoch, code: event?.errorCode });
              fail('The speech connection stopped. Your project is saved; reconnect to continue.');
            }
          };
          instance.sessionStopped = () => {
            if (current()) { diagnostics.event('recognition.stopped', { epoch }); fail('The speech session ended. Reconnect to continue with the same project.'); }
          };
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const abort = () => finish(aborted());
            const timer = window.setTimeout(() => finish(new Error('The speech connection timed out. Please reconnect.')), 15_000);
            const finish = (error?: Error) => {
              if (settled) return;
              settled = true; window.clearTimeout(timer); lifetime.signal.removeEventListener('abort', abort);
              error ? reject(error) : resolve();
            };
            lifetime.signal.addEventListener('abort', abort, { once: true });
            try { instance.startContinuousRecognitionAsync(() => finish(), () => finish(new Error('The microphone could not connect to the speech service.'))); }
            catch { finish(new Error('The speech connection could not start.')); }
            if (lifetime.signal.aborted) abort();
          });
          checkOpen();
          if (current()) diagnostics.event('recognition.ready', { epoch });
          return current();
        };
        const restoreRecognition = (message: string) => {
          if (closed || muted) return;
          diagnostics.event('recognition.recovery', { epoch: recognitionEpoch });
          cancelLocalCandidate();
          // Invalidate callbacks before releasing provisional input. A late final
          // must never be admitted after recovery or under a switched specialist.
          stopRecognition(); onset.reset(); asrActive = false; controller!.noMatch();
          emit({ type: 'error', message: 'Restoring voice input…', recoverable: true, retryable: false });
          void startRecognition().then(ready => {
            if (ready && !closed && !muted) emit({ type: 'error', message, recoverable: true, retryable: false });
          }).catch(() => { if (!closed) fail('The microphone could not resume. Reconnect to continue.'); });
        };
        await startRecognition(); checkOpen();
        diagnostics.record('connection-ready', performance.now() - connectionStartedAt);
        diagnostics.event('connection.ready');
        const refreshToken = async () => {
          try {
            const refreshed = await tokenFor(id, lifetime.signal); checkOpen();
            if (refreshed.region !== token.region) throw new Error('Speech configuration changed. Reconnect to continue.');
            token = refreshed;
            diagnostics.event('authorization.refresh');
            if (recognizer) recognizer.authorizationToken = token.token;
            tokenTimer = window.setTimeout(() => void refreshToken(), Math.max(10_000, token.expiresAt - Date.now() - 120_000));
          } catch { if (!closed) { diagnostics.event('authorization.failed'); fail('Voice authorization could not be renewed. Reconnect to continue.'); } }
        };
        tokenTimer = window.setTimeout(() => void refreshToken(), Math.max(10_000, token.expiresAt - Date.now() - 120_000));
        const input = new Float32Array(inputMeter.fftSize), output = new Float32Array(player.analyser.fftSize);
        const abandonLocalOnlyInput = () => {
          const candidate = localCandidate;
          if (!candidate || candidate.epoch !== recognitionEpoch || closed || muted || asrActive) return;
          restoreRecognition('That interruption was not captured. Please repeat it.');
        };
        const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        let lastCaptureSample = Number.NEGATIVE_INFINITY;
        const meter = (time: number) => {
          if (closed) return;
          try {
            inputMeter!.getFloatTimeDomainData(input); player!.analyser.getFloatTimeDomainData(output);
            const inputLevel = muted ? 0 : rms(input);
            if (time - lastCaptureSample >= 5_000) {
              lastCaptureSample = time;
              diagnostics.event('capture.sample', {
                epoch: recognitionEpoch, muted, inputActive: onset.isElevated(inputLevel), asrActive,
                liveTracks: microphone!.getAudioTracks().filter(track => track.readyState === 'live').length,
                enabledTracks: microphone!.getAudioTracks().filter(track => track.enabled).length,
                recognitionTracks: recognitionInput?.getAudioTracks().filter(track => track.readyState === 'live').length ?? 0,
                state, ...connectionProbe?.snapshot(),
              });
            }
            emit({ type: 'amplitude', value: Math.min(1, Math.max(inputLevel, rms(output)) * 6) });
            if (!muted) {
              const event = onset.sample(inputLevel, state === 'speaking', asrActive || Boolean(localCandidate), time);
              if (localCandidate?.timer !== undefined && onset.isElevated(inputLevel)) {
                window.clearTimeout(localCandidate.timer);
                localCandidate.timer = window.setTimeout(abandonLocalOnlyInput, 5_000);
              }
              if (event === 'start') {
                cancelLocalCandidate();
                if (!asrActive) localCandidate = { epoch: recognitionEpoch };
                controller!.speechStarted();
              } else if (event === 'end') {
                controller!.speechEnded();
                if (localCandidate) localCandidate.timer = window.setTimeout(abandonLocalOnlyInput, 5_000);
              }
            }
            frame = requestAnimationFrame(meter);
          } catch { fail('The browser audio connection stopped. Reconnect to continue.'); }
        };
        frame = requestAnimationFrame(meter); activity();
        if (!restored) emit({ type: 'state', state: 'listening' });
        return {
          close, interrupt: () => { checkOpen(); activity(); controller!.interrupt(); },
          canSwitchSpecialist: () => !closed && controller!.canSwitchSpecialist(),
          setSpecialist(next) {
            checkOpen();
            const selected = normalizeSpecialist(next);
            if (!controller!.canSwitchSpecialist()) throw new Error('Finish or recover the current turn before switching specialists.');
            controller!.interrupt(); specialist = selected;
            emit({ type: 'specialist', specialist }); activity();
          },
          async setMuted(value: boolean) {
            checkOpen();
            if (muted === value) return;
            muted = value;
            diagnostics.event('capture.muted', { muted });
            microphone!.getAudioTracks().forEach(track => { track.enabled = !muted; });
            onset.reset(); asrActive = false;
            cancelLocalCandidate();
            if (muted) { stopRecognition(); controller!.noMatch(); }
            else {
              try { await startRecognition(); }
              catch (error) { if (!closed) fail('The microphone could not resume. Reconnect to continue.'); throw error; }
            }
            activity();
          },
          retryTurn: () => { checkOpen(); activity(); controller!.retryTurn(); },
          async retryPlayback() { checkOpen(); activity(); await audio!.resume(); checkOpen(); controller!.retryPlayback(); },
        };
      } catch (error) {
        const failure = error instanceof DOMException && error.name === 'NotAllowedError'
          ? new Error('Microphone access was not allowed. Allow it in your browser or continue in text.')
          : error instanceof Error ? error : new Error('Voice could not connect. Continue with your saved text conversation.');
        if (!closed) fail(failure.message);
        close(); throw failure;
      }
    },
  };
}
