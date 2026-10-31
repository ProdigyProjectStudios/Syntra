export type ResponseDepth = 'concise' | 'detailed' | 'deep_dive';

export interface ServiceArea {
  id: string;
  name: string;
  tagline: string;
  description: string;
  capabilities: string[];
}

export type ContactOptionKind = 'link' | 'email' | 'phone';
export interface ContactOption {
  id: string;
  label: string;
  detail: string;
  href: string;
  kind: ContactOptionKind;
}

export interface ConversationSummary {
  id: number;
  title: string;
  depth: ResponseDepth;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export type MessageRole = 'visitor' | 'advisor';
export interface Message {
  id: number;
  role: MessageRole;
  content: string;
  depth: ResponseDepth;
  createdAt: string;
}

export type BriefKey =
  | 'objective'
  | 'service'
  | 'proposedSolution'
  | 'requirements'
  | 'integrations'
  | 'budget'
  | 'timeline'
  | 'nextStep';
export type BriefFieldStatus = 'confirmed' | 'suggested' | 'manual';
export interface BriefProvenance {
  status: BriefFieldStatus;
  evidence: string;
}
export interface Brief {
  objective: string | null;
  service: string | null;
  proposedSolution: string | null;
  requirements: string | null;
  integrations: string | null;
  budget: string | null;
  timeline: string | null;
  nextStep: string | null;
  revision: number;
  provenance: Partial<Record<BriefKey, BriefProvenance>>;
}

export interface Conversation extends ConversationSummary {
  messages: Message[];
  brief: Brief;
  turns: Array<{ responseId: string; depth: ResponseDepth }>;
}

export type BriefUpdate = Partial<Pick<Brief, BriefKey>>;
export interface ConversationInput { depth: ResponseDepth }
export interface MessageInput {
  content: string;
  depth: ResponseDepth;
  requestId: string;
}
export interface AdvisorReply {
  message: Message;
  brief: Brief;
  suggestedNextSteps: string[];
}

/** Retained as UI state labels only; the runtime owns the actual realtime session. */
export const VoiceSessionStatus = {
  connecting: 'connecting',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  idle: 'idle',
  error: 'error',
} as const;
export type VoiceSessionStatus = (typeof VoiceSessionStatus)[keyof typeof VoiceSessionStatus];
