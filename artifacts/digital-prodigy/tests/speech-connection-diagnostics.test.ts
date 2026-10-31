import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Connection, ConnectionMessageEventArgs } from 'microsoft-cognitiveservices-speech-sdk';
import type { VoiceDiagnostics } from '../src/lib/development-voice/voice-diagnostics.ts';
import { observeSpeechConnection } from '../src/lib/development-voice/speech-connection-diagnostics.ts';

function fixture() {
  const events: Array<{ stage: string; fields: unknown }> = [];
  let closes = 0;
  const connection = { close: () => { closes++; } } as unknown as Connection;
  const diagnostics = { event: (stage: string, fields: unknown) => { events.push({ stage, fields }); } } as VoiceDiagnostics;
  const observer = observeSpeechConnection(connection, diagnostics, 4);
  return { connection, observer, events, closes: () => closes };
}
function message(path: string, bytes = 0) {
  return { message: { path, isBinaryMessage: bytes > 0,
    get binaryMessage() { return new ArrayBuffer(bytes); },
    get TextMessage() { throw new Error('Transcript must not be read'); },
    get properties() { throw new Error('Credentials and request headers must not be read'); },
  } } as unknown as ConnectionMessageEventArgs;
}

test('speech connection diagnostics count transmitted bytes and service phrases without reading bodies or headers', () => {
  const f = fixture();
  f.connection.connected({} as never);
  f.connection.messageSent(message('audio', 44)); // Includes protocol header; this is not proof of captured speech.
  f.connection.messageSent(message('audio', 3200));
  f.connection.messageSent(message('audio'));
  f.connection.messageReceived(message('speech.hypothesis'));
  f.connection.messageReceived(message('speech.fragment'));
  f.connection.messageReceived(message('speech.phrase'));
  f.connection.messageReceived(message('turn.end'));
  const snapshot = f.observer.snapshot();
  assert.equal(snapshot.socketConnected, true);
  assert.equal(snapshot.sentAudioMessages, 2);
  assert.equal(snapshot.sentAudioBytes, 3244);
  assert.equal(snapshot.serviceHypotheses, 2);
  assert.equal(snapshot.servicePhrases, 1);
  assert.ok(snapshot.audioSendAgeMs! >= 0);
  assert.deepEqual(f.events.map(event => event.stage), ['recognition.connected', 'recognition.first-audio-message', 'recognition.service-phrase', 'recognition.service-turn-end']);
  assert.ok(f.events.every(event => JSON.stringify(event.fields) === '{"epoch":4}'));
  f.connection.disconnected({} as never);
  assert.equal(f.observer.snapshot().socketConnected, false);
  f.observer.close();
});

test('debug protocol changes and late callbacks after retirement cannot change counters or throw into recognition', () => {
  const f = fixture();
  const lateSent = f.connection.messageSent, lateConnected = f.connection.connected;
  assert.doesNotThrow(() => f.connection.messageSent({ get message() { throw new Error('Unknown debug schema'); } } as never));
  assert.doesNotThrow(() => f.connection.messageReceived({ message: { path: undefined } } as never));
  f.connection.messageSent(message('PRIVATE TOKEN', 123));
  f.connection.messageReceived(message('PRIVATE TRANSCRIPT'));
  assert.deepEqual(f.events, []);
  f.observer.close(); f.observer.close();
  lateSent(message('audio', 3200)); lateConnected({} as never);
  f.connection.messageReceived(message('speech.phrase'));
  assert.equal(f.observer.snapshot().sentAudioMessages, 0);
  assert.equal(f.observer.snapshot().servicePhrases, 0);
  assert.deepEqual(f.events, []);
  assert.equal(f.closes(), 1);
});
