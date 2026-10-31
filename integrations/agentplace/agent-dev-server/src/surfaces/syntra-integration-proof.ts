import type { ComponentContract } from '../../vendor/agentplace-a2ui/contract-schema.ts';

export const SYNTRA_DASHBOARD: ComponentContract = {
  component: 'SyntraDashboard',
  purpose: 'Display Syntra by Digital Prodigy as the conversation canvas, preserving the transferred dashboard navigation, styling, motion, and voice visual. The consultation uses the current native Agentplace model, session transcript, and realtime voice. Its eight-field brief is durable only within the current Agentplace session and keeps confirmed, suggested, or visitor-edited provenance. Contact and booking actions are not available unless a verified destination and live capability are connected.',
  props: {},
  fallbackTemplate: () => 'Syntra helps visitors scope a software project using the native Agentplace conversation. This channel cannot display the interactive dashboard. No verified contact destination, live enquiry action, or calendar booking is connected.',
};
