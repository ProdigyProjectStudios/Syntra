export type Depth = 'concise' | 'detailed' | 'deep_dive';

export const BRIEF_KEYS = [
  'objective',
  'service',
  'proposedSolution',
  'requirements',
  'integrations',
  'budget',
  'timeline',
  'nextStep',
] as const;

export type BriefKey = (typeof BRIEF_KEYS)[number];
export type BriefFields = Record<BriefKey, string | null>;
export type FieldStatus = 'confirmed' | 'suggested' | 'manual';

export interface FieldProvenance {
  status: FieldStatus;
  evidence: string;
}

export interface Brief extends BriefFields {
  revision: number;
  provenance: Partial<Record<BriefKey, FieldProvenance>>;
}

export const EMPTY_FIELDS: BriefFields = {
  objective: null,
  service: null,
  proposedSolution: null,
  requirements: null,
  integrations: null,
  budget: null,
  timeline: null,
  nextStep: null,
};

export interface Message {
  id: number;
  role: 'visitor' | 'advisor';
  content: string;
  depth: Depth;
  createdAt: string;
}

export interface SessionSummary {
  id: number;
  title: string;
  depth: Depth;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Conversation extends Omit<SessionSummary, 'messageCount'> {
  messages: Message[];
  brief: Brief;
}

export interface BriefChange {
  value: string | null;
  status: 'confirmed' | 'suggested';
  /** Exact quotation from a visitor message, not model-generated evidence. */
  evidence: string;
}

export interface AdvisorResult {
  reply: string;
  changes: Partial<Record<BriefKey, BriefChange>>;
  suggestedNextSteps: string[];
  title?: string;
}

export interface AdvisorInput {
  history: Pick<Message, 'role' | 'content'>[];
  currentBrief: Brief;
  depth: Depth;
  isFirstMessage: boolean;
}

export interface AIProvider {
  consult(input: AdvisorInput): Promise<AdvisorResult>;
}

export interface TurnInput {
  content: string;
  depth: Depth;
  requestId: string;
}

export interface TurnReply {
  visitorMessage: Message;
  message: Message;
  brief: Brief;
  suggestedNextSteps: string[];
}

/** owner is a trusted identity from the host, never from request JSON. */
export interface ConversationRepository {
  list(owner: string): Promise<SessionSummary[]>;
  create(owner: string, depth: Depth): Promise<Conversation>;
  get(owner: string, id: number): Promise<Conversation | null>;
  replay(owner: string, id: number, requestId: string): Promise<TurnReply | null>;
  commitTurn(
    owner: string,
    before: Conversation,
    input: TurnInput,
    result: AdvisorResult,
  ): Promise<TurnReply>;
  editBrief(owner: string, id: number, changes: Partial<BriefFields>, revision: number): Promise<Brief>;
}

export type VoiceEvent =
  | { type: 'state'; state: 'connecting' | 'listening' | 'speaking' | 'closed' }
  | { type: 'amplitude'; value: number }
  | { type: 'transcript'; text: string; final: boolean; role: 'visitor' | 'advisor' }
  | { type: 'conversation-updated' }
  | { type: 'error'; message: string };

export interface VoiceConnection {
  close(): void | Promise<void>;
}

export interface VoiceAdapter {
  available: boolean;
  /** Host owns realtime transport, mic permissions, interruption and audio playback. */
  connect(
    conversationId: number,
    onEvent: (event: VoiceEvent) => void,
    signal: AbortSignal,
  ): Promise<VoiceConnection>;
}

export interface ContactOption {
  id: string;
  label: string;
  detail: string;
  href: string;
  kind: 'link' | 'email' | 'phone';
}

export interface ServiceArea {
  id: string;
  name: string;
  tagline: string;
  description: string;
  capabilities: string[];
}

export interface BookingAdapter {
  contacts(): Promise<ContactOption[]>;
  /** No implicit booking. Only expose when the host has a real connected action. */
  book?: (
    conversationId: number,
    confirmedByVisitor: boolean,
  ) => Promise<{ status: 'confirmed'; reference: string }>;
}

/** Browser-facing boundary; this host binds it to Agentplace's native runtime. */
export interface ConsultationRuntime {
  sessions: {
    list(): Promise<SessionSummary[]>;
    create(depth: Depth): Promise<Conversation>;
    get(id: number, signal?: AbortSignal): Promise<Conversation>;
  };
  messages: { send(id: number, input: TurnInput): Promise<TurnReply> };
  briefs: {
    get(id: number, signal?: AbortSignal): Promise<Brief>;
    update(id: number, changes: Partial<BriefFields>, revision: number): Promise<Brief>;
  };
  services(): Promise<ServiceArea[]>;
  voice: VoiceAdapter;
  booking: BookingAdapter;
}
