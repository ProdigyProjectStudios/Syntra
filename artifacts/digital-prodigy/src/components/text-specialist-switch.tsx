import { ArrowUpRight, Blocks, GitBranch, Sparkles } from "lucide-react";
import { Link } from "wouter";
import {
  SPECIALISTS,
  getSpecialistProfile,
  type SpecialistId,
} from "@workspace/consultation";
import { useAdvisor } from "@/lib/advisor";
import { cn } from "@/lib/utils";

const ICONS = { syntra: Sparkles, technical: Blocks, automation: GitBranch };
const LABELS = {
  syntra: "The opportunity",
  technical: "The architecture",
  automation: "The workflow",
};
const PROMPTS: Record<SpecialistId, string> = {
  syntra:
    "Help me clarify the business bottleneck and the outcome that would make this project worthwhile. Use what we already know and ask the one most useful follow-up question.",
  technical:
    "Build on our current project brief. Propose a practical architecture with the major components, data flows, integration boundaries and the main engineering trade-off. Contribute useful recommendations and verification needs to our Solution Blueprint without treating assumptions as confirmed.",
  automation:
    "Build on our current brief and architecture. Map a useful automation workflow: trigger, actions, exceptions, human review, and how we would measure the outcome. Contribute this to our shared Solution Blueprint. Do not invent savings or assume an integration is available.",
};

/** Three perspectives over one consultation; selecting a role never creates a thread. */
export function TextSpecialistSwitch() {
  const { specialist, setSpecialist, specialistLocked } = useAdvisor();
  const profile = getSpecialistProfile(specialist);
  return (
    <section
      className="mb-6 rounded-[22px] border border-white/[.075] bg-background/45 p-2 sm:p-3"
      aria-label="Consultation perspectives"
      data-testid="text-specialist-switch"
    >
      <div
        className="flex gap-1"
        role="radiogroup"
        aria-label="Consultation specialist"
      >
        {SPECIALISTS.map((item, index) => {
          const Icon = ICONS[item.id];
          const active = specialist === item.id;
          return (
            <button
              key={item.id}
              role="radio"
              aria-checked={active}
              aria-label={`${item.name}, ${item.title}`}
              tabIndex={active ? 0 : -1}
              disabled={specialistLocked}
              data-testid={`button-text-specialist-${item.id}`}
              onClick={() => setSpecialist(item.id)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? SPECIALISTS.length - 1
                      : direction
                        ? (index + direction + SPECIALISTS.length) %
                          SPECIALISTS.length
                        : -1;
                if (next < 0) return;
                event.preventDefault();
                if (setSpecialist(SPECIALISTS[next].id))
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [next]?.focus();
              }}
              className={cn(
                "flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-45 sm:justify-start sm:px-3",
                active
                  ? "border border-primary/25 bg-primary/[.075] text-primary"
                  : "border border-transparent text-foreground/55 hover:bg-white/[.035] hover:text-foreground",
              )}
            >
              <Icon
                className="hidden h-4 w-4 shrink-0 min-[375px]:block"
                strokeWidth={1.5}
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium tracking-wide sm:text-sm">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-[9px] text-foreground/45 sm:text-[10px]">
                  {LABELS[item.id]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p
        className="px-2 pb-1 pt-2 text-[11px] leading-relaxed text-muted-foreground"
        data-testid="text-specialist-description"
      >
        <span className="text-foreground/75">{profile.title}.</span>{" "}
        {profile.description}{" "}
        <span className="text-foreground/40">
          One shared conversation and Blueprint.
        </span>
      </p>
      {specialistLocked && (
        <p role="status" className="px-2 pb-1 text-[11px] text-amber-200/80">
          Finish or recover the current request before changing perspective.
        </p>
      )}
    </section>
  );
}

/** An invitation based on the current context, never a mandatory qualification wizard. */
export function BlueprintNextStep() {
  const {
    conversation,
    specialist,
    setSpecialist,
    send,
    sending,
    specialistLocked,
  } = useAdvisor();
  if (
    !conversation?.messages.some((message) => message.role === "visitor") ||
    sending
  )
    return null;
  const objective = conversation.brief.objective;
  const next: SpecialistId | null = !objective
    ? "syntra"
    : specialist === "syntra"
      ? "technical"
      : specialist === "technical"
        ? "automation"
        : null;
  const title = !objective
    ? "Start with the outcome."
    : next === "technical"
      ? "Give the idea a structure."
      : next === "automation"
        ? "Design the work around it."
        : "Bring the recommendations together.";
  const description = !objective
    ? "Clarify the friction and what a useful first result would look like."
    : next === "technical"
      ? "Explore the components, dependencies and trade-offs with Kryon."
      : next === "automation"
        ? "Map triggers, exceptions and human review with Nyx."
        : "Review the living Blueprint, correct the details and take a copy into your consultation.";
  return (
    <div
      className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-primary/[.035] p-4"
      data-testid="blueprint-next-step"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground/85">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {next ? (
        <button
          type="button"
          disabled={specialistLocked}
          data-testid={`button-explore-${next}`}
          onClick={() => {
            if (setSpecialist(next)) send(PROMPTS[next]);
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 px-3 text-xs text-primary transition hover:bg-primary/10 disabled:opacity-40"
        >
          {next === "syntra"
            ? "Clarify with Syntra"
            : next === "technical"
              ? "Explore with Kryon"
              : "Map with Nyx"}{" "}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Link
          href="/brief"
          data-testid="link-review-blueprint"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/25 px-3 text-xs text-primary transition hover:bg-primary/10"
        >
          Review Blueprint <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
