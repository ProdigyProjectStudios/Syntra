import { PcmPlayer } from './pcm-player.ts';

type SpeechSdk = typeof import('microsoft-cognitiveservices-speech-sdk');

/** Use the same PCM playback as live Azure voice; synthesis completion is not playback completion. */
export function playChatReply(sdk: SpeechSdk, config: import('microsoft-cognitiveservices-speech-sdk').SpeechConfig,
  context: AudioContext, text: string, signal: AbortSignal, onStart: () => void,
  onEnd: () => void, onError: () => void): () => void {
  const player = new PcmPlayer(context);
  let synth: InstanceType<SpeechSdk['SpeechSynthesizer']> | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', close);
    player.dispose();
    try { synth?.close(); } catch { /* Output nodes are already stopped. */ }
  };
  const fail = () => { if (!closed) { close(); onError(); } };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) { close(); return close; }
  try {
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
    synth = new sdk.SpeechSynthesizer(config, null as unknown as InstanceType<SpeechSdk['AudioConfig']>);
    const playback = player.begin(onStart);
    synth.synthesizing = (_, event) => {
      if (closed) return;
      try { player.append(event.result.audioData); } catch { fail(); }
    };
    synth.speakTextAsync(text, result => {
      if (closed) return;
      if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) { fail(); return; }
      try { player.end(); } catch { fail(); return; }
      void playback.then(() => {
        if (closed) return;
        close();
        onEnd();
      });
    }, fail);
  } catch { fail(); }
  return close;
}
