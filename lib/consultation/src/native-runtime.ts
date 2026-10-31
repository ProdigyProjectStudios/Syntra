import type { Brief, BriefFields, ConsultationRuntime, Conversation, Depth, Message, ServiceArea, SessionSummary, TurnInput, VoiceAdapter, BookingAdapter } from "./types.ts";

/** Native infrastructure is injected. No SDK, transport, storage or model is owned here. */
export interface NativePorts {
  /** Immutable identity for this adapter. A host session change must remount the surface. */
  scope: string;
  currentScope(): string;
  sessions: {
    list(): Promise<SessionSummary[]>;
    get(id: number, signal?: AbortSignal): Promise<Conversation>;
    /** Only provide if this really creates/switches native sessions, not ensureSession. */
    create?: (depth: Depth) => Promise<Conversation>;
    setDepth(id: number, depth: Depth): Promise<void>;
  };
  briefs: {
    get(id: number, signal?: AbortSignal): Promise<Brief>;
    update(id: number, changes: Partial<BriefFields>, revision: number): Promise<Brief>;
  };
  turns: {
    begin(id: number, input: TurnInput): Promise<{ status: "reserved" | "pending" | "completed"; responseId?: string }>;
    attach(requestId: string, responseId: string): Promise<void>;
    /** Server verifies response/session/request binding and success from native history. No browser reply text. */
    complete(requestId: string, responseId: string): Promise<Brief>;
  };
  messaging: {
    busy(): boolean;
    send(content: string, metadata: { syntraDepth: Depth; syntraRequestId: string }, admitted: (responseId: string) => void): Promise<void>;
    /** Read the single canonical persisted pair; never fabricate IDs or append a voice transcript. */
    pair(responseId: string, depth: Depth): { visitorMessage: Message; message: Message } | null;
  };
  services(): Promise<ServiceArea[]>;
  booking: BookingAdapter;
  voice: VoiceAdapter;
}

export function createNativeRuntime(ports: NativePorts): ConsultationRuntime {
  const assertScope = () => {
    if (!ports.scope || ports.currentScope() !== ports.scope) throw new Error("The native session changed. Reopen this consultation.");
  };
  const scoped = async <T>(work: () => Promise<T>): Promise<T> => {
    assertScope();
    const result = await work();
    assertScope();
    return result;
  };
  let sending = false;
  return {
    sessions: {
      list: () => scoped(() => ports.sessions.list()),
      get: (id, signal) => scoped(() => ports.sessions.get(id, signal)),
      create: depth => scoped(async () => {
        if (!ports.sessions.create) throw new Error("Start a new native session using Agent controls. The current transcript has not been cleared.");
        return ports.sessions.create(depth);
      }),
      setDepth: (id, depth) => scoped(() => ports.sessions.setDepth(id, depth)),
    },
    briefs: {
      get: (id, signal) => scoped(() => ports.briefs.get(id, signal)),
      update: (id, changes, revision) => scoped(() => ports.briefs.update(id, changes, revision)),
    },
    services: () => scoped(() => ports.services()),
    booking: { contacts: () => scoped(() => ports.booking.contacts()),
      ...(ports.booking.book ? { book: (id: number, consent: boolean) => scoped(async () => {
        if (consent !== true) throw new Error("Visitor confirmation is required.");
        return ports.booking.book!(id, consent);
      }) } : {}),
      ...(ports.booking.submitEnquiry ? { submitEnquiry: (input: import("./handoff.ts").EnquiryInput) => scoped(async () => {
        if (input.consent !== true) throw new Error("Visitor confirmation is required.");
        return ports.booking.submitEnquiry!(input);
      }) } : {}),
    },
    voice: {
      available: ports.voice.available,
      async connect(id, onEvent, signal) {
        assertScope();
        if (signal.aborted) throw new Error("Voice connection canceled.");
        const connection = await ports.voice.connect(id, event => {
          if (!signal.aborted && ports.currentScope() === ports.scope) onEvent(event);
        }, signal);
        if (signal.aborted || ports.currentScope() !== ports.scope) {
          await connection.close();
          throw new Error("Voice connection canceled.");
        }
        return connection;
      },
    },
    messages: {
      async send(id, input) {
        assertScope();
        if (sending) throw new Error("A consultation response is already in progress.");
        sending = true;
        try {
          if (ports.messaging.busy()) throw new Error("The native agent is busy. Check the transcript before retrying.");
          const admission = await scoped(() => ports.turns.begin(id, input));
          let responseId = admission.responseId;
          if (admission.status === "reserved") {
            // A durable reservation is returned only once. Lost/uncertain admissions never resend.
            let attached: Promise<void> | undefined;
            await scoped(() => ports.messaging.send(input.content, {
              syntraDepth: input.depth, syntraRequestId: input.requestId,
            }, nativeId => {
              responseId = nativeId;
              attached = scoped(() => ports.turns.attach(input.requestId, nativeId));
              // Avoid an unhandled rejection while the native model is still running.
              void attached.catch(() => {});
            }));
            if (attached) await attached;
          }
          if (!responseId) throw new Error("This request's native admission is unresolved. Check Agent controls; it will not be sent twice.");
          const brief = await scoped(() => ports.turns.complete(input.requestId, responseId!));
          const pair = ports.messaging.pair(responseId, input.depth);
          if (!pair) throw new Error("The native transcript is still settling. Retry to reload this completed turn, not resend it.");
          assertScope();
          return { ...pair, brief, suggestedNextSteps: [] };
        } finally { sending = false; }
      },
    },
  };
}
