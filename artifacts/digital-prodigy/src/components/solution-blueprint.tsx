import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  Layers3,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "wouter";
import {
  BLUEPRINT_SECTIONS,
  BLUEPRINT_BRIEF_FIELDS,
  blueprintMarkdown,
  getSpecialistProfile,
  type Blueprint,
  type BlueprintEdit,
  type BlueprintItem,
  type BlueprintSectionKey,
  type BlueprintStatus,
  type BriefKey,
  type Depth,
  BUSINESS_PROFILE,
} from "@workspace/consultation";
import { useRuntime, useRuntimeKeys } from "@/lib/runtime-context";
import { useGetBlueprint } from "@/lib/runtime-hooks";
import { useAdvisor } from "@/lib/advisor";
import { errorMessage } from "@/lib/errors";
import {
  createBlueprintOperationStore,
  type PendingBlueprintOperation,
} from "@/lib/pending-blueprint-operation";
import { cn } from "@/lib/utils";

const STATUS: Record<BlueprintStatus, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmed",
    className: "border-emerald-300/20 bg-emerald-300/[.05] text-emerald-200/85",
  },
  recommendation: {
    label: "Recommendation",
    className: "border-primary/20 bg-primary/[.05] text-primary/85",
  },
  assumption: {
    label: "Assumption",
    className: "border-amber-200/20 bg-amber-200/[.04] text-amber-100/80",
  },
  manual: {
    label: "Edited",
    className: "border-violet-300/25 bg-violet-300/[.055] text-violet-200/90",
  },
};
const ACTION =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

export function SolutionBlueprint({
  id,
  onEditBrief,
}: {
  id: number;
  onEditBrief: (key: BriefKey) => void;
}) {
  const { runtime, scope } = useRuntime();
  const { depth, sending, specialistLocked } = useAdvisor();
  const {
    getGetBlueprintQueryKey,
    getGetConversationQueryKey,
    getGetBriefQueryKey,
  } = useRuntimeKeys();
  const query = useGetBlueprint(id);
  const qc = useQueryClient();
  const store = useMemo(() => createBlueprintOperationStore(scope), [scope]);
  const [pending, setPending] = useState<PendingBlueprintOperation | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const [filter, setFilter] = useState<"all" | "review" | "edited">("all");
  const mounted = useRef(true);
  const recovered = useRef(false);
  const manualCopyId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      !query.data ||
      query.isError ||
      !query.isFetchedAfterMount ||
      recovered.current
    )
      return;
    recovered.current = true;
    try {
      const original = store.load(id);
      if (original) {
        setPending(original);
        setError(
          "An earlier Blueprint change needs confirmation. Recover it using its original request before making another change.",
        );
      }
    } catch {
      setError(
        "This tab could not read its saved Blueprint change. No new change has been sent.",
      );
    }
  }, [query.data, query.isError, query.isFetchedAfterMount, id, store]);
  useEffect(() => setCopyStatus("idle"), [query.data?.version]);

  async function perform(
    operation: PendingBlueprintOperation,
  ): Promise<boolean> {
    if (!runtime.blueprints || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPending(operation);
    try {
      store.save(operation);
      const result =
        operation.kind === "regenerate"
          ? await runtime.blueprints.regenerate(id, operation.input)
          : await runtime.blueprints.update(id, operation.input);
      await qc.cancelQueries({ queryKey: getGetBlueprintQueryKey(id) });
      // Receipt replay returns the latest document, preserving later manual edits.
      qc.setQueryData<Blueprint>(getGetBlueprintQueryKey(id), (previous) =>
        previous && previous.version > result.version ? previous : result,
      );
      store.clear(id, operation.input.requestId);
      void qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getGetBriefQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getGetBlueprintQueryKey(id) });
      if (mounted.current) {
        setPending(null);
        setError(null);
      }
      return true;
    } catch (failure) {
      const message = errorMessage(
        failure,
        failure instanceof Error
          ? failure.message
          : "The Blueprint change could not be confirmed. Recover the original request safely.",
      );
      const detail =
        failure && typeof failure === "object" && "data" in failure
          ? failure.data
          : undefined;
      const code =
        failure && typeof failure === "object" && "code" in failure
          ? failure.code
          : detail && typeof detail === "object" && "code" in detail
            ? detail.code
            : undefined;
      const conflict = code === "BLUEPRINT_VERSION_CONFLICT";
      const rejected = code === "BLUEPRINT_CHANGE_REJECTED";
      // Only these explicit contract codes prove the mutation did not commit.
      // Transport failures and other HTTP errors retain the immutable receipt.
      if (conflict || rejected) {
        try {
          store.clear(id, operation.input.requestId);
          if (mounted.current) setPending(null);
        } catch {
          /* Keep the original request until recovery is safe. */
        }
        void query.refetch();
      }
      if (mounted.current)
        setError(
          conflict
            ? `${message} Your draft is still here. Review the current version before saving it.`
            : rejected
              ? `${message} This change was not saved. ${operation.kind === "update" && !operation.input.edit.remove ? "Your draft is still here; revise it before saving again." : "Review your planning notes before trying again."}`
              : message,
        );
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const document = query.data;
  const items = document ? Object.values(document.sections).flat() : [];
  const reviewCount = items.filter(
    (item) => item.reviewRequired || item.status === "assumption",
  ).length;
  const editedCount = items.filter((item) => item.status === "manual").length;
  const blocked = busy || Boolean(pending) || sending || specialistLocked;
  const markdown = document ? blueprintMarkdown(document) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("manual");
    }
  }
  function download() {
    if (!document) return;
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `syntra-solution-blueprint-v${document.version}.md`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const edit = (change: BlueprintEdit, version: number) =>
    perform({
      id,
      kind: "update",
      input: { version, requestId: crypto.randomUUID(), edit: change },
    });

  if (!runtime.blueprints)
    return (
      <div
        className="rounded-3xl border border-dashed border-white/15 p-6 text-sm leading-relaxed text-muted-foreground"
        data-testid="blueprint-unavailable"
      >
        Blueprint storage is not connected in this environment. Your project
        brief remains available to review and export.
      </div>
    );
  if (query.isLoading)
    return (
      <div
        role="status"
        className="space-y-3"
        aria-label="Loading Solution Blueprint"
      >
        {[0, 1, 2].map((value) => (
          <div
            key={value}
            className="h-28 animate-pulse rounded-2xl bg-secondary/40"
          />
        ))}
      </div>
    );
  if (!document)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-destructive/30 p-5 text-sm"
      >
        <p>
          Your Blueprint could not load. Your conversation and brief are
          preserved.
        </p>
        <button
          className={cn(ACTION, "mt-3 border-primary/25 text-primary")}
          onClick={() => void query.refetch()}
          data-testid="button-retry-blueprint"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry loading
        </button>
      </div>
    );

  return (
    <div data-testid="solution-blueprint" className="space-y-5">
      <div className="edge-light relative overflow-hidden rounded-[26px] border border-primary/15 bg-[linear-gradient(135deg,hsl(217_90%_50%/.09),hsl(236_45%_5%/.55))] p-5 sm:p-6">
        <div
          className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border border-primary/10"
          aria-hidden
        >
          <div className="absolute inset-5 rounded-full border border-primary/10" />
          <div className="absolute inset-12 rounded-full border border-ion/15" />
        </div>
        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="w-full min-w-0 sm:flex-1" data-testid="blueprint-hero-copy">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[.2em] text-primary/70">
              <span className="inline-flex items-center gap-2 whitespace-nowrap"><Layers3 className="h-3.5 w-3.5 shrink-0" /> Living solution /</span>{" "}
              <span className="whitespace-nowrap" data-testid="status-blueprint-version">
                Version {document.version}
              </span>
            </div>
            <h2 className="font-display text-xl font-light tracking-tight sm:text-2xl" data-testid="blueprint-hero-heading">
              From possibility to a practical plan.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/60">
              A shared working document shaped by your brief and specialist
              conversations. Corrections stay yours when the plan evolves.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0" data-testid="blueprint-hero-actions">
            <button
              className={cn(
                ACTION,
                "border-white/15 text-foreground/75 hover:border-primary/35 hover:text-primary",
              )}
              onClick={() => void copy()}
              data-testid="button-copy-blueprint"
            >
              {copyStatus === "copied" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}{" "}
              {copyStatus === "copied" ? "Copied" : "Copy"}
            </button>
            <button
              className={cn(
                ACTION,
                "border-primary/25 bg-primary/[.05] text-primary hover:bg-primary/10",
              )}
              onClick={download}
              data-testid="button-export-blueprint"
            >
              <Download className="h-3.5 w-3.5" /> Markdown
            </button>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[.07] pt-4 text-[11px] text-muted-foreground">
          <span>
            <span className="font-mono text-primary">{items.length}</span>{" "}
            planning notes
          </span>
          <span>
            <span className="font-mono text-amber-200/80">{reviewCount}</span>{" "}
            to verify
          </span>
          <span>
            <span className="font-mono text-violet-200/80">{editedCount}</span>{" "}
            edited
          </span>
          <span>Brief revision {document.briefRevision}</span>
          <button
            type="button"
            disabled={blocked}
            onClick={() =>
              void perform({
                id,
                kind: "regenerate",
                input: {
                  version: document.version,
                  requestId: crypto.randomUUID(),
                },
              })
            }
            data-testid={
              document.version
                ? "button-regenerate-blueprint"
                : "button-generate-blueprint"
            }
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", busy && "motion-safe:animate-spin")}
            />{" "}
            {busy ? "Saving…" : "Sync from brief"}
          </button>
        </div>
      </div>

      {(error || pending) && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200/25 bg-amber-200/[.035] p-4 text-sm leading-relaxed text-amber-100/90"
          data-testid="blueprint-operation-error"
        >
          <p>{error ?? "Saving this Blueprint change…"}</p>
          {pending?.kind === "update" && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer">
                Original change retained for recovery
              </summary>
              <p className="mt-2 font-medium">
                {pending.input.edit.title ??
                  (pending.input.edit.remove
                    ? "Remove planning note"
                    : "Planning note correction")}
              </p>
              <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground/65">
                {pending.input.edit.detail ?? pending.input.edit.itemId}
              </p>
            </details>
          )}
          {pending && !busy && (
            <button
              type="button"
              onClick={() => void perform(pending)}
              className={cn(ACTION, "mt-3 border-amber-200/30 text-amber-100")}
              data-testid="button-recover-blueprint"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Recover original change
            </button>
          )}
        </div>
      )}
      {copyStatus === "manual" && (
        <div className="rounded-2xl border border-primary/20 p-4">
          <p role="alert" className="text-xs text-amber-200">
            Clipboard access was blocked. Select the document below or download
            Markdown.
          </p>
          <label
            htmlFor={manualCopyId}
            className="mt-3 block text-xs text-muted-foreground"
          >
            Your Solution Blueprint
          </label>
          <textarea
            id={manualCopyId}
            value={markdown}
            readOnly
            rows={7}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full rounded-xl border border-primary/25 bg-background/60 p-3 font-mono text-xs"
            data-testid="textarea-manual-copy-blueprint"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter Blueprint notes"
        >
          {(["all", "review", "edited"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              data-testid={`button-blueprint-filter-${value}`}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs transition",
                filter === value
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "all"
                ? "Whole Blueprint"
                : value === "review"
                  ? "Needs verification"
                  : "Your edits"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {depth === "deep_dive"
            ? "Deep dive · details expanded"
            : depth === "concise"
              ? "Concise · expand what matters"
              : "Detailed · explore each layer"}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {BLUEPRINT_SECTIONS.map((section, index) => {
          const visible = document.sections[section.id].filter(
            (item) =>
              filter === "all" ||
              (filter === "edited"
                ? item.status === "manual"
                : item.status === "assumption" || item.reviewRequired),
          );
          if (filter !== "all" && !visible.length) return null;
          return (
            <BlueprintSection
              key={section.id}
              section={section}
              index={index}
              items={visible}
              version={document.version}
              depth={depth}
              blocked={blocked}
              onEdit={edit}
              onEditBrief={onEditBrief}
            />
          );
        })}
      </div>
      {filter !== "all" &&
        !(filter === "edited" ? editedCount : reviewCount) && (
          <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
            {filter === "edited"
              ? "No manual corrections yet. Edit a planning note to make it yours."
              : "No notes in this filter. Review the full plan before committing to implementation."}
          </p>
        )}
      <BlueprintHistory blueprint={document} />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 p-4">
        <p className="flex max-w-xl items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary/65" />{" "}
          Planning guidance, not a delivery commitment. Confirm scope, access
          and assumptions with Digital Prodigy before implementation.
        </p>
        <Link
          href="/book"
          className={cn(ACTION, "border-primary/25 text-primary")}
          data-testid="link-blueprint-handoff"
        >
          Take it into a consultation <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function BlueprintSection({
  section,
  index,
  items,
  version,
  depth,
  blocked,
  onEdit,
  onEditBrief,
}: {
  section: (typeof BLUEPRINT_SECTIONS)[number];
  index: number;
  items: BlueprintItem[];
  version: number;
  depth: Depth;
  blocked: boolean;
  onEdit: (edit: BlueprintEdit, version: number) => Promise<boolean>;
  onEditBrief: (key: BriefKey) => void;
}) {
  const expandedByDepth =
    depth === "deep_dive" ||
    (depth === "detailed" &&
      ["objectives", "architecture", "workflows", "roadmap"].includes(
        section.id,
      ));
  const [expanded, setExpanded] = useState(expandedByDepth);
  useEffect(() => setExpanded(expandedByDepth), [depth]);
  return (
    <section
      className={cn(
        "self-start overflow-hidden rounded-[22px] border border-white/[.085] bg-background/45",
        ["architecture", "workflows", "roadmap"].includes(section.id) &&
          expanded &&
          "lg:col-span-2",
      )}
      data-testid={`blueprint-section-${section.id}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`blueprint-panel-${section.id}`}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-5"
      >
        <span className="mt-0.5 font-mono text-[10px] text-primary/45">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground/90">
            {section.label}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {section.description}
          </span>
        </span>
        <span className="mt-0.5 font-mono text-[10px] text-primary/60">
          {items.length}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div
          id={`blueprint-panel-${section.id}`}
          className="space-y-3 border-t border-white/[.055] p-3 sm:p-4"
        >
          {items.length ? (
            items.map((item) => (
              <BlueprintNote
                key={item.id}
                item={item}
                section={section.id}
                version={version}
                depth={depth}
                blocked={blocked}
                onEdit={onEdit}
                onEditBrief={onEditBrief}
              />
            ))
          ) : (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
              Not established yet. Explore this with{" "}
              {["architecture", "integrations", "risks", "tradeoffs"].includes(
                section.id,
              )
                ? "Kryon"
                : ["workflows", "value"].includes(section.id)
                  ? "Nyx"
                  : "Syntra"}
              ; useful findings will join this shared plan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function BlueprintNote({
  item,
  section,
  version,
  depth,
  blocked,
  onEdit,
  onEditBrief,
}: {
  item: BlueprintItem;
  section: BlueprintSectionKey;
  version: number;
  depth: Depth;
  blocked: boolean;
  onEdit: (edit: BlueprintEdit, version: number) => Promise<boolean>;
  onEditBrief: (key: BriefKey) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: item.title,
    detail: item.detail,
    details: item.details ?? [],
  });
  const [editVersion, setEditVersion] = useState(version);
  const [removeReview, setRemoveReview] = useState(false);
  const status = STATUS[item.status];
  const canonical = Object.hasOwn(BLUEPRINT_BRIEF_FIELDS, item.id)
    ? BLUEPRINT_BRIEF_FIELDS[item.id]
    : undefined;
  const start = () => {
    setDraft({
      title: item.title,
      detail: item.detail,
      details: item.details?.map((note) => ({ ...note })) ?? [],
    });
    setEditVersion(version);
    setEditing(true);
  };
  return (
    <article
      className="rounded-2xl border border-white/[.055] bg-white/[.018] p-4"
      data-testid={`blueprint-item-${item.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[9px] font-medium",
            status.className,
          )}
          data-testid={`status-blueprint-${item.id}`}
        >
          {status.label}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {item.source === "brief"
            ? canonical
              ? "Project brief"
              : "Brief-based direction"
            : item.source === "manual"
              ? "Your correction"
              : getSpecialistProfile(item.specialist).name}
        </span>
        {item.reviewRequired && (
          <span
            className="text-[10px] text-amber-200"
            data-testid={`review-blueprint-${item.id}`}
          >
            Review after brief change
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          {version !== editVersion && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200/20 p-3 text-xs leading-relaxed text-amber-100"
            >
              This Blueprint changed while you were editing. Current note:{" "}
              {item.detail}
              <button
                type="button"
                onClick={() => setEditVersion(version)}
                className="mt-2 block underline"
                data-testid={`button-review-blueprint-${item.id}`}
              >
                I reviewed the latest version; keep my draft
              </button>
            </div>
          )}
          <label className="block text-xs text-muted-foreground">
            Title
            <input
              autoFocus
              value={draft.title}
              maxLength={160}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              className="mt-1.5 block w-full rounded-xl border border-input bg-background/60 px-3 py-2 text-base text-foreground outline-none focus:border-primary/50 sm:text-sm"
              data-testid={`title-blueprint-${item.id}`}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Planning note
            <textarea
              value={draft.detail}
              maxLength={1200}
              rows={4}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  detail: event.target.value,
                }))
              }
              className="mt-1.5 block w-full rounded-xl border border-input bg-background/60 px-3 py-2 text-base leading-relaxed text-foreground outline-none focus:border-primary/50 sm:text-sm"
              data-testid={`input-blueprint-${item.id}`}
            />
          </label>
          {!item.calculation &&
            draft.details.map((note, index) => (
              <label
                key={`${index}-${note.label}`}
                className="block text-xs text-muted-foreground"
              >
                {note.label}
                <textarea
                  rows={2}
                  maxLength={300}
                  value={note.value}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      details: previous.details.map((value, i) =>
                        i === index
                          ? { ...value, value: event.target.value }
                          : value,
                      ),
                    }))
                  }
                  className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-base text-foreground sm:text-sm"
                />
              </label>
            ))}
          {item.calculation && (
            <p className="text-xs text-muted-foreground">
              Calculation inputs remain tied to their evidence. Ask Nyx to
              revise the scenario if those inputs have changed.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={blocked}
              onClick={() => setEditing(false)}
              className={cn(ACTION, "border-transparent text-muted-foreground")}
              data-testid={`button-cancel-blueprint-${item.id}`}
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              disabled={
                blocked ||
                version !== editVersion ||
                !draft.title.trim() ||
                !draft.detail.trim()
              }
              onClick={() =>
                void onEdit(
                  {
                    section,
                    itemId: item.id,
                    title: draft.title.trim(),
                    detail: draft.detail.trim(),
                    ...(!item.calculation ? { details: draft.details } : {}),
                  },
                  editVersion,
                ).then((saved) => {
                  if (saved) setEditing(false);
                })
              }
              className={cn(
                ACTION,
                "border-primary/30 bg-primary/10 text-primary",
              )}
              data-testid={`button-save-blueprint-${item.id}`}
            >
              <Check className="h-3.5 w-3.5" /> Save correction
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="mt-3 break-words text-sm font-medium text-foreground/90">
            {item.title}
          </h3>
          <p className="mt-1.5 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-foreground/70">
            {item.detail}
          </p>
          {!!item.details?.length && (
            <details open={depth === "deep_dive"} className="mt-3">
              <summary className="cursor-pointer text-[11px] text-primary/75">
                {item.calculation
                  ? "Scenario inputs and calculation"
                  : "Structured detail"}
              </summary>
              <dl className="mt-3 space-y-3 border-l border-primary/20 pl-3">
                {item.details.map((note, index) => (
                  <div key={`${index}-${note.label}`}>
                    <dt className="font-mono text-[9px] uppercase tracking-wide text-primary/65">
                      {note.label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-xs leading-relaxed text-foreground/65">
                      {note.label === "Source" &&
                      note.value === `${BUSINESS_PROFILE.website}/` ? (
                        <a
                          href={note.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary/80 underline underline-offset-2"
                        >
                          Published portfolio{" "}
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      ) : (
                        note.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {item.evidence && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] text-muted-foreground">
                Evidence & basis
              </summary>
              <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] border-l border-white/10 pl-3 text-xs leading-relaxed text-foreground/55">
                {item.evidence}
              </p>
            </details>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[.045] pt-2">
            {canonical ? (
              <button
                type="button"
                disabled={blocked}
                onClick={() => onEditBrief(canonical)}
                data-testid={`button-edit-blueprint-${item.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 text-[11px] text-primary/75 hover:text-primary disabled:opacity-40"
              >
                <Pencil className="h-3 w-3" /> Edit in project brief
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={start}
                  data-testid={`button-edit-blueprint-${item.id}`}
                  className="inline-flex min-h-9 items-center gap-1.5 text-[11px] text-primary/75 hover:text-primary disabled:opacity-40"
                >
                  <Pencil className="h-3 w-3" /> Edit note
                </button>
                <button
                  type="button"
                  disabled={blocked}
                  aria-label={`Remove ${item.title}`}
                  onClick={() => setRemoveReview(true)}
                  className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-rose-300/10 hover:text-rose-200 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
          {removeReview && !canonical && (
            <div className="mt-2 rounded-xl border border-rose-300/20 p-3 text-xs text-foreground/75">
              <p>
                Remove this planning note? Future syncs will respect your
                removal.
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  disabled={blocked}
                  onClick={() => setRemoveReview(false)}
                  className="min-h-8 text-muted-foreground"
                >
                  Keep note
                </button>
                <button
                  disabled={blocked}
                  onClick={() =>
                    void onEdit(
                      { section, itemId: item.id, remove: true },
                      version,
                    )
                  }
                  className="min-h-8 text-rose-200"
                >
                  Remove note
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function BlueprintHistory({ blueprint }: { blueprint: Blueprint }) {
  return (
    <details
      className="rounded-2xl border border-white/[.075] bg-background/40 p-4"
      data-testid="blueprint-history"
    >
      <summary
        className="cursor-pointer list-none text-xs text-foreground/65"
        data-testid="button-blueprint-history"
      >
        <span className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-primary/65" /> Recent version
          history <ChevronDown className="ml-auto h-3.5 w-3.5" />
        </span>
      </summary>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Recent changes with before/after excerpts. The current document remains
        the editable version.
      </p>
      <ol className="mt-3 space-y-2">
        {[...blueprint.history].reverse().map((version) => (
          <li
            key={version.version}
            data-testid={`blueprint-version-${version.version}`}
            className="rounded-xl border border-white/[.055] p-3"
          >
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-primary/80">
                Version {version.version}{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {version.source === "manual"
                    ? "Your correction"
                    : version.source === "brief" ||
                        version.source === "regenerate"
                      ? "Brief sync"
                      : getSpecialistProfile(version.specialist).name}
                </span>
              </span>
              <time
                className="text-[10px] text-muted-foreground"
                dateTime={version.createdAt}
              >
                {new Date(version.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {version.changedSections
                .map(
                  (key) =>
                    BLUEPRINT_SECTIONS.find((section) => section.id === key)
                      ?.label ?? key,
                )
                .join(" · ") || "Reviewed without changing notes"}
            </p>
            {!!version.changes?.length && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] text-primary/65">
                  Review change excerpts
                </summary>
                <div className="mt-2 space-y-2">
                  {version.changes.map((change, index) => (
                    <div
                      key={`${change.itemId}-${index}`}
                      className="rounded-lg bg-white/[.025] p-2 text-[11px] leading-relaxed"
                    >
                      <p className="font-medium text-foreground/75">
                        {change.after?.title ??
                          change.before?.title ??
                          "Planning note"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        <span className="text-rose-200/65">Before:</span>{" "}
                        {change.before?.detail ?? "Not present"}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        <span className="text-primary/70">After:</span>{" "}
                        {change.after?.detail ?? "Removed by your correction"}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
