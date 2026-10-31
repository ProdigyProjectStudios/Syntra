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
PORT=5173 BASE_PATH=/ pnpm build
pnpm test:agentplace
```

Read `integrations/agentplace/README.md` for the exact export command and destination layout. Use its generated transfer manifest to check file contents, including deferred route and visual modules. Copy the generated scoped stylesheet as instructed there.

Register the native surface using the existing AgentPlace registries, session identity and runtime. Follow the registration patch notes; do not transplant Replit Express, cookies, database ownership or development provider credentials.

## Voice and text ownership

AgentPlace retains its native Luna, bidirectional audio, permission handling, session state and interruption/reconnect lifecycle. The UI calls the typed `VoiceAdapter`; voice transcripts must be persisted once by the owning runtime and followed by `conversation-updated`, not submitted again through the text composer.

Existing voice state events remain valid. A transport may additionally emit `state: thinking` while a real response is pending. Emit `listening`, `speaking`, `closed` or `error` when that state actually changes. The UI displays short progress labels; it does not expose private reasoning or delay an answer to imitate thinking.

The requested Replit development experience is interruption-capable realtime speech with a natural female voice, using the existing consultation engine for intelligence. A separate speech-provider connection is required. Until that connection and adapter are implemented and verified, Replit voice remains explicitly unconnected; UI animation/status support alone is not operational voice. Never replace AgentPlace's working native voice with the development provider.

## Safety and acceptance

- Preserve the complete visual experience, response-depth context, manual edits and provenance.
- Keep native session identity authoritative and isolate caches/late results by session.
- Keep enquiry IDs and consented reviewed snapshots stable after uncertain outcomes.
- Connect only real approved providers; never fabricate availability, receipts or successful submissions.
- Run native host SDK/type and actual audio checks in AgentPlace before release.

See `docs/ASSESSMENT-CONVERSION-ACCEPTANCE.md` and `docs/ASSESSMENT-CONVERSION-QA.md` for verified conversion behavior and remaining host requirements. No export command publishes or deploys the app.
