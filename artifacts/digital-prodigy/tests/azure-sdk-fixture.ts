import { SpeechServiceRecognizer } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/SpeechServiceRecognizer.js";
import { RequestSession } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RequestSession.js";
import type { SpeechRecognitionEventArgs } from "microsoft-cognitiveservices-speech-sdk";

/** The installed SDK's phrase parser and request lifecycle, without a socket or audio capture. */
export async function sdkRecognitionFixture(callbacks: {
  recognizing?(event: SpeechRecognitionEventArgs): void;
  recognized?(event: SpeechRecognitionEventArgs): void;
}) {
  const session = new RequestSession("test-audio-source");
  session.startNewRecognition();
  session.onPreConnectionStart("test-auth-event", "test-recognition-session");
  await session.onAudioSourceAttachCompleted({
    findTimeAtOffset: () => 0,
    shrinkBuffers: () => {},
    replay: () => {},
    detach: async () => {},
  } as never, false);
  // Exercise the actual message parser. Constructor wiring would open unrelated
  // audio/authentication resources; the fixture supplies its already-started request.
  const parser = Object.create(SpeechServiceRecognizer.prototype);
  Object.assign(parser, {
    privRequestSession: session,
    privRecognizerConfig: { parameters: { getProperty: () => "Simple" } },
    privSpeechRecognizer: {
      recognizing: (_sender: unknown, event: SpeechRecognitionEventArgs) => callbacks.recognizing?.(event),
      recognized: (_sender: unknown, event: SpeechRecognitionEventArgs) => callbacks.recognized?.(event),
    },
  });
  return {
    get resultId() { return session.requestId; },
    hypothesis: (text: string, offset: number, duration: number) => parser.processTypeSpecificMessages({
      path: "speech.hypothesis", textBody: JSON.stringify({ Text: text, Offset: offset, Duration: duration }),
    }),
    phrase: (text: string, offset: number, duration: number, status: "Success" | "NoMatch" = "Success") => parser.processTypeSpecificMessages({
      path: "speech.phrase", textBody: JSON.stringify({ RecognitionStatus: status, DisplayText: text, Offset: offset, Duration: duration }),
    }),
    async nextServiceTurn() {
      await session.onServiceTurnEndResponse(true);
      session.onSpeechContext();
    },
    close: () => session.dispose(),
  };
}
