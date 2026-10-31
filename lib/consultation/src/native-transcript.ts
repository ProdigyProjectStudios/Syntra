import type { Depth, Message } from "./types.ts";

/** Recover a canonical pair by native response identity, never by visual proximity. */
export function nativeTranscriptPair(
  entries: Array<{ responseId: string; message: Message }>,
  responseId: string,
): { visitorMessage: Message; message: Message } | null {
  const visitor = entries.find(entry => entry.responseId === responseId && entry.message.role === "visitor");
  const advisor = entries.find(entry => entry.responseId === responseId && entry.message.role === "advisor");
  return visitor && advisor ? { visitorMessage: visitor.message, message: advisor.message } : null;
}

export interface NativeTranscriptPart {
  /** Stable native content/part identity, not a timestamp or filtered-array index. */
  key: string;
  responseId: string;
  role: "visitor" | "advisor";
  kind: "text" | "audio";
  text: string;
  createdAt: string;
  hidden?: boolean;
  reasoning?: boolean;
}
/** One UI message per native response/role; voice captions are never another message source. */
export class NativeTranscript {
  private ids = new Map<string, number>();
  read(parts: NativeTranscriptPart[], depth: Depth, turns: Array<{ responseId: string; depth: Depth }> = []) {
    const groups = new Map<string, NativeTranscriptPart[]>();
    // Streaming updates may repeat a native part ID. Latest content wins, while
    // insertion order and UI identity stay stable. A later hidden update removes it.
    for (const part of new Map(parts.map(part => [part.key, part])).values()) {
      if (part.hidden || part.reasoning || !part.text.trim() || part.text === "[user opened the agent]" ||
          (part.kind === "audio" && part.role === "advisor")) continue;
      if (!part.key || !part.responseId) throw new Error("Native transcript identities are required.");
      const key = `${part.responseId}:${part.role}`;
      const group = groups.get(key) ?? [];
      if (!group.some(p => p.key === part.key)) group.push(part);
      groups.set(key, group);
    }
    return [...groups].map(([key, group]) => {
      if (!this.ids.has(key)) this.ids.set(key, this.ids.size + 1);
      // Prefer the native text representation over the same visitor audio transcription.
      const textParts = group.some(p => p.kind === "text") ? group.filter(p => p.kind === "text") : group;
      const text = textParts.map(p => p.text.trim()).join("\n\n");
      const first = group[0];
      const message: Message = {
        id: this.ids.get(key)!, role: first.role, content: text,
        depth: turns.find(t => t.responseId === first.responseId)?.depth ?? depth,
        createdAt: first.createdAt,
      };
      return { responseId: first.responseId, message };
    });
  }
}
