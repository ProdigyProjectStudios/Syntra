import { BRIEF_KEYS } from "./types.ts";
import type { Brief, BriefKey, FieldStatus } from "./types.ts";

/**
 * Portable, purely local project-brief handoff.
 * No personal transcript, session identifiers, speculative prices or network calls.
 */
export const HANDOFF_LABELS: Record<BriefKey, string> = {
  objective: "Business objective",
  service: "Service direction",
  proposedSolution: "Proposed solution",
  requirements: "Essential requirements",
  integrations: "Integrations and dependencies",
  budget: "Budget",
  timeline: "Timeline",
  nextStep: "Recommended next step",
};

const QUESTIONS: Record<BriefKey, string> = {
  objective: "What business outcome would make this project worthwhile?",
  service: "Which Digital Prodigy service best addresses the problem?",
  proposedSolution: "What should the first useful release actually deliver?",
  requirements: "Which features or workflows are essential for the first release?",
  integrations: "Which existing tools or data sources may need connecting?",
  budget: "What investment range would be comfortable, even provisionally?",
  timeline: "Is there a target date or business deadline?",
  nextStep: "What decision or conversation would move the project forward?",
};

export type HandoffStatus = "not_started" | "in_progress" | "ready_for_discussion";
export type HandoffFieldStatus = FieldStatus | "not_established";

export interface HandoffField {
  key: BriefKey;
  label: string;
  value: string | null;
  status: HandoffFieldStatus;
}

export interface HandoffQuestion {
  key: BriefKey;
  question: string;
}

export interface HandoffAssessment {
  status: HandoffStatus;
  established: number;
  total: number;
  confirmed: number;
  edited: number;
  suggested: number;
  openQuestions: HandoffQuestion[];
  reviewSuggestions: HandoffQuestion[];
}

export interface HandoffPacket {
  schemaVersion: 1;
  product: "Syntra by Digital Prodigy";
  generatedAt: string;
  documentType: "working_project_brief";
  status: HandoffStatus;
  notice: string;
  readiness: HandoffAssessment;
  fields: HandoffField[];
}

/** "Unknown" is useful context but does not count as a resolved decision. */
function valueOf(brief: Brief, key: BriefKey): string | null {
  const value = brief[key]?.trim() ?? "";
  if (!value || /^(?:unknown|unsure|not sure|not set|tbd|n\/a|not established(?: yet)?)$/i.test(value)) {
    return null;
  }
  return value;
}

function fieldStatus(brief: Brief, key: BriefKey): HandoffFieldStatus {
  return valueOf(brief, key) ? (brief.provenance[key]?.status ?? "not_established") : "not_established";
}

export function assessHandoff(brief: Brief): HandoffAssessment {
  const values = Object.fromEntries(BRIEF_KEYS.map(key => [key, valueOf(brief, key)])) as Record<BriefKey, string | null>;
  const populated = BRIEF_KEYS.filter(key => values[key] !== null);
  const confirmed = populated.filter(key => fieldStatus(brief, key) === "confirmed").length;
  const edited = populated.filter(key => fieldStatus(brief, key) === "manual").length;
  const suggested = populated.filter(key => fieldStatus(brief, key) === "suggested").length;
  const objectiveKnown = values.objective !== null && fieldStatus(brief, "objective") !== "suggested";
  const scopeKnown = values.requirements !== null && fieldStatus(brief, "requirements") !== "suggested";
  const directionKnown = values.service !== null || values.proposedSolution !== null;

  // This is a DISCUSSION readiness signal, never a qualification, quote or booking confirmation.
  const status: HandoffStatus = populated.length === 0
    ? "not_started"
    : objectiveKnown && scopeKnown && directionKnown
      ? "ready_for_discussion"
      : "in_progress";
  return {
    status,
    established: populated.length,
    total: BRIEF_KEYS.length,
    confirmed,
    edited,
    suggested,
    openQuestions: BRIEF_KEYS.filter(key => !values[key]).map(key => ({ key, question: QUESTIONS[key] })),
    reviewSuggestions: BRIEF_KEYS.filter(key => !!values[key] && fieldStatus(brief, key) === "suggested")
      .map(key => ({ key, question: "Confirm whether the suggested " + HANDOFF_LABELS[key].toLowerCase() + " fits." })),
  };
}

export function createHandoffPacket(brief: Brief, generatedAt: Date = new Date()): HandoffPacket {
  const readiness = assessHandoff(brief);
  return {
    schemaVersion: 1,
    product: "Syntra by Digital Prodigy",
    generatedAt: generatedAt.toISOString(),
    documentType: "working_project_brief",
    status: readiness.status,
    notice: "Exploratory project brief, not a formal quotation, booking, delivery commitment or verified technical specification. Review suggested details before sharing.",
    readiness,
    fields: BRIEF_KEYS.map(key => ({
      key,
      label: HANDOFF_LABELS[key],
      value: valueOf(brief, key),
      status: fieldStatus(brief, key),
    })),
  };
}

const STATUS_LABELS: Record<HandoffFieldStatus, string> = {
  confirmed: "Confirmed by visitor",
  suggested: "Suggested; needs review",
  manual: "Edited by visitor",
  not_established: "Not established",
};

const READINESS_LABELS: Record<HandoffStatus, string> = {
  not_started: "Not started",
  in_progress: "Working draft",
  ready_for_discussion: "Ready for an initial discussion",
};

function escapeMarkdown(value: string): string {
  const plain = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  return plain.replace(/\\/g, "\\\\")
    .replace(/([*_{}\[\]()#+\-.!|>~])/g, "\\$1")
    .replaceAll(String.fromCharCode(96), "\\" + String.fromCharCode(96))
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatHandoffMarkdown(packet: HandoffPacket): string {
  const sections = [
    "# Syntra — Project Brief",
    "",
    "Prepared: " + packet.generatedAt.slice(0, 10) + " (UTC)",
    "Status: " + READINESS_LABELS[packet.status],
    "",
    "> " + packet.notice,
  ];
  for (const field of packet.fields) {
    sections.push("", "## " + field.label, "",
      "**Source:** " + STATUS_LABELS[field.status], "",
      field.value === null ? "_Not established_" : escapeMarkdown(field.value));
  }
  sections.push("", "## Open decisions", "");
  if (packet.readiness.openQuestions.length === 0) sections.push("No missing fields recorded. Review recommendations and dependencies before proceeding.");
  else for (const item of packet.readiness.openQuestions) sections.push("- " + escapeMarkdown(item.question));
  if (packet.readiness.reviewSuggestions.length) {
    sections.push("", "## Recommendations to confirm", "");
    for (const item of packet.readiness.reviewSuggestions) sections.push("- " + escapeMarkdown(item.question));
  }
  sections.push("", "---", "",
    "Created from the current project brief only. No conversation transcript or customer contact details are included automatically.",
    "Sharing this file does not submit an enquiry or reserve a consultation.",
    "");
  return sections.join("\n");
}

export function formatHandoffJSON(packet: HandoffPacket): string {
  return JSON.stringify(packet, null, 2) + "\n";
}

export function handoffFileName(extension: "md" | "json", generatedAt: Date = new Date()): string {
  return "syntra-project-brief-" + generatedAt.toISOString().slice(0, 10) + "." + extension;
}
