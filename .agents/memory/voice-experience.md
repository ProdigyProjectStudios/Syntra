---
name: Syntra voice experience
description: User requirements for realtime voice, female presentation and pending-response labels.
---
Syntra needs realtime voice with interruption in Replit, while retaining AgentPlace's native production voice.

Syntra should sound like an intelligent AI mixed with a human-type female voice. The user subsequently approved a British male voice for Kryon and a British female voice for Nyx. After a question, show words like “Calculating” and “Evaluating” while it thinks.

**Why:** The user explicitly chose realtime voice with interruption and specified these presentation requirements.

**How to apply:** Keep any Replit speech provider isolated from the AgentPlace native runtime. Keep the existing consultation intelligence and context; progress words are visible waiting-state labels, not private reasoning.

Use the existing Azure Speech development engine rather than rebuilding or replacing voice.

**Why:** The user configured Azure and explicitly instructed us to inspect and test the already-implemented continuous recognition, streamed PCM playback, interruption handling and three specialist voices.

**How to apply:** Fix integration failures in the current adapter without redesigning Syntra. Keep AgentPlace's native voice independent, and distinguish live cloud tests with prerecorded input from real human microphone, speaker and voice-quality verification.

Use natural pitch, cadence and speed. Do not add robotic effects, modulation, artificial delays or pitch shifts.

**Why:** The user explicitly approved natural specialist delivery and prohibited these effects.

**How to apply:** Preserve the approved selection documented in the repository; do not substitute voices or add delivery processing during integration.

The speaking orb should move smoothly with the voice response, not use jarring or exaggerated speaking animations.

**Why:** The user explicitly said the speaking animation was too jarring and should feel like it is speaking with the voice.

**How to apply:** Keep voice-driven motion restrained, continuous across state changes and responsive to spoken audio.

Speak a short acknowledgement while the AI prepares a complex answer, not for greetings, simple conversation or straightforward factual answers.

**Why:** The user requested spoken phrases such as “Let me look into this” during the thinking gap, then clarified these should only occur for complex answers, never simple conversation such as “hello” or “hi”.

**How to apply:** Use the selected specialist's natural voice. Keep acknowledgements interruptible and separate from persisted conversation messages; do not delay the answer to finish them.

Reuse valid short-lived Azure authorization for repeated chat speech actions in the same owned consultation, without storing tokens persistently or sharing them across consultations.

**Why:** Repeated dictation/read-aloud toggles exhausted the separate voice-token issuance allowance even while Azure authentication was healthy. Increasing the model's daily allowance does not resolve that limit.

**How to apply:** Keep authorization in tab memory, respect expiry with a safety margin, and clear it when the consultation changes. Preserve server-side ownership checks and issuance limits.
