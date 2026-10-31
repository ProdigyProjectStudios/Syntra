---
name: Syntra voice experience
description: User requirements for realtime voice, female presentation and pending-response labels.
---
Syntra needs realtime voice with interruption in Replit, while retaining AgentPlace's native production voice.

The voice should sound like an intelligent AI mixed with a human-type voice, female. After a question, show words like “Calculating” and “Evaluating” while it thinks.

**Why:** The user explicitly chose realtime voice with interruption and specified these presentation requirements.

**How to apply:** Keep any Replit speech provider isolated from the AgentPlace native runtime. Keep the existing consultation intelligence and context; progress words are visible waiting-state labels, not private reasoning.

Use the existing Azure Speech development engine rather than rebuilding or replacing voice.

**Why:** The user configured Azure and explicitly instructed us to inspect and test the already-implemented continuous recognition, streamed PCM playback, interruption handling and three specialist voices.

**How to apply:** Fix integration failures in the current adapter without redesigning Syntra. Keep AgentPlace's native voice independent, and distinguish live cloud tests with prerecorded input from real human microphone, speaker and voice-quality verification.
