# Syntra: Replit development → AgentPlace

Develop and verify the canonical UI here, push it to GitHub, then integrate the generated native transfer into AgentPlace. Do not copy an older AgentPlace frontend over the current source.

## Repository boundaries

| Location | Responsibility |
| --- | --- |
| `artifacts/digital-prodigy/src` | Canonical React UI, styles, neural visuals, responsive behavior and runtime consumers |
| `lib/consultation/src` | Shared typed contracts, consultation/brief rules, provenance, depth and safe handoff coordination |
| `artifacts/api-server` | Private Replit development backend; not an AgentPlace server replacement |
| `integrations/agentplace` | Export/validation tools, native adapter examples and host registration notes |
| `generated-artifacts/agentplace` | Reproducible transfer output; generated and excluded from Git |

## Verify before transfer

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:voice
PORT=5173 BASE_PATH=/ pnpm build
pnpm test:agentplace
```

Read `integrations/agentplace/README.md` for the exact export command and destination layout. Use its generated transfer manifest to check file contents, including deferred route and visual modules. Copy the generated scoped stylesheet as instructed there.

Register the native surface using the existing AgentPlace registries, session identity and runtime. Follow the registration patch notes; do not transplant Replit Express, cookies, database ownership or development provider credentials.

## Voice and text ownership

AgentPlace retains its native Luna, bidirectional audio, permission handling, session state and interruption/reconnect lifecycle. The UI calls the typed `VoiceAdapter`; voice transcripts must be persisted once by the owning runtime and followed by `conversation-updated`, not submitted again through the text composer.

Existing voice state events remain valid. A transport may additionally emit `state: thinking` while a real response is pending. Emit `listening`, `speaking`, `closed` or `error` when that state actually changes. The UI displays short progress labels; it does not expose private reasoning or delay an answer to imitate thinking.

The Replit development adapter now implements continuous Azure speech recognition and streamed PCM playback through the existing consultation engine. It remains disabled until both client/server configuration and real Speech credentials are supplied. See [Voice intelligence](VOICE-INTELLIGENCE.md) for setup and outstanding live checks. The exporter excludes `lib/development-voice/` and the Replit runtime composition; do not install Azure credentials or its SDK into AgentPlace for this transfer.

Specialists are optional capabilities. The development adapter advertises three profiles and changes personality/voice within the same conversation. The native adapter forwards only capabilities the actual host advertises. Until a native hook implements safe profile changes and distinct voices, the native UI permits Syntra only. Do not label UI-only profile changes as a successful native specialist connection. The optional specialist field defaults to Syntra for historical requests and receipts.

Voice errors distinguish retrying an uncertain original consultation turn from replaying an already-saved response. Preserve that distinction in any native integration; replaying audio must never resubmit the model turn. A finalized native transcript pair must share its response identity, as specified in the registration notes.

## Safety and acceptance

- Preserve the complete visual experience, response-depth context, manual edits and provenance.
- Keep native session identity authoritative and isolate caches/late results by session.
- Keep enquiry IDs and consented reviewed snapshots stable after uncertain outcomes.
- Connect only real approved providers; never fabricate availability, receipts or successful submissions.
- Run native host SDK/type and actual audio checks in AgentPlace before release.

See `docs/ASSESSMENT-CONVERSION-ACCEPTANCE.md` and `docs/ASSESSMENT-CONVERSION-QA.md` for verified conversion behavior and remaining host requirements. No export command publishes or deploys the app.
