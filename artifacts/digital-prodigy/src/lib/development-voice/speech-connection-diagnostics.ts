import type { Connection } from 'microsoft-cognitiveservices-speech-sdk';
import type { VoiceDiagnostics } from './voice-diagnostics.ts';

/** Debug observation only: SDK message paths must never drive conversation decisions. */
export function observeSpeechConnection(connection: Connection, diagnostics: VoiceDiagnostics, epoch: number) {
  let active = true, socketConnected = false;
  let sentAudioMessages = 0, sentAudioBytes = 0, serviceHypotheses = 0, servicePhrases = 0;
  let lastAudioAt: number | undefined;
  connection.connected = () => {
    if (!active) return;
    socketConnected = true; diagnostics.event('recognition.connected', { epoch });
  };
  connection.disconnected = () => {
    if (!active) return;
    socketConnected = false; diagnostics.event('recognition.disconnected', { epoch });
  };
  connection.messageSent = event => {
    if (!active) return;
    try {
      const message = event.message;
      if (message.path.toLowerCase() !== 'audio' || !message.isBinaryMessage) return;
      const bytes = message.binaryMessage?.byteLength ?? 0;
      if (!bytes) return;
      sentAudioMessages++; sentAudioBytes += bytes; lastAudioAt = performance.now();
      if (sentAudioMessages === 1) diagnostics.event('recognition.first-audio-message', { epoch });
      // Do not retain a message, headers, binary data, text or credential.
    } catch { /* Debug schema differences cannot affect provider callbacks. */ }
  };
  connection.messageReceived = event => {
    if (!active) return;
    try {
      switch (event.message.path.toLowerCase()) {
        case 'speech.hypothesis': case 'speech.fragment': serviceHypotheses++; break;
        case 'speech.phrase':
          servicePhrases++; diagnostics.event('recognition.service-phrase', { epoch }); break;
        case 'turn.start': diagnostics.event('recognition.service-turn-start', { epoch }); break;
        case 'turn.end': diagnostics.event('recognition.service-turn-end', { epoch }); break;
      }
    } catch { /* Never log a raw SDK error or message body. */ }
  };
  return {
    snapshot: () => ({ socketConnected, sentAudioMessages, sentAudioBytes, serviceHypotheses, servicePhrases,
      ...(lastAudioAt === undefined ? {} : { audioSendAgeMs: Math.max(0, performance.now() - lastAudioAt) }) }),
    close() {
      if (!active) return;
      active = false;
      // SDK 1.53 Connection.close is a no-op. Clear our closures explicitly; the
      // owning recognizer closes the actual connection and its event sources.
      const ignore = () => {};
      connection.connected = ignore; connection.disconnected = ignore;
      connection.messageSent = ignore; connection.messageReceived = ignore;
      try { connection.close(); } catch { /* Recognition cleanup is independent. */ }
    },
  };
}
