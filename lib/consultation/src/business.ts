import type { ContactOption, ServiceArea } from "./types.ts";

/**
 * Public business facts reviewed on 2026-11-01 against Digital Prodigy's website.
 * Its "Book a Build Call" route opens /contact, an enquiry form, not a calendar.
 * This catalogue is shared by development and the deterministic native transfer.
 */
export const BUSINESS_PROFILE = {
  name: "Digital Prodigy",
  consultant: "Aaron Archer",
  website: "https://digitalprodigy.dev",
  contactSource: "https://digitalprodigy.dev/contact",
  contactVerifiedOn: "2026-11-01",
} as const;

/** Bounded descriptions of published work, not independently audited outcomes. */
export const PORTFOLIO_EXAMPLES = [
  { name: "FlowCraft AI", serviceIds: ["ai-automation", "ai-mvp-saas"],
    summary: "A visual AI workflow product with agent workflows, analytics and execution tracking." },
  { name: "Flow Analytics AI", serviceIds: ["client-portals", "ai-mvp-saas"],
    summary: "Agency analytics dashboards with AI insights, client reporting and integrations." },
  { name: "NEXUS AI Assets", serviceIds: ["client-portals", "premium-product-ui"],
    summary: "An agency client portal combining project progress, milestone payments, chat and AI support." },
  { name: "AgentOps Command Center", serviceIds: ["ai-automation"],
    summary: "An operational multi-agent workflow that pauses for human approval before finalizing consequential work." },
].map(example => ({ ...example, sourceUrl: "https://digitalprodigy.dev/", verifiedOn: "2026-11-01" }));

export const PORTFOLIO_GUIDANCE = `Published project examples from Digital Prodigy's own website, reviewed on 2026-11-01:
${PORTFOLIO_EXAMPLES.map(example => `- ${example.name}: ${example.summary}`).join("\n")}
Source: https://digitalprodigy.dev/.
When useful, choose at most one relevant example and explain the specific similarity to the visitor's needs. Describe it as published work, not proof of a guaranteed result. These descriptions do not establish current demo availability, customer metrics, prices, delivery times or transferable ready-made products. Do not invent case studies or imply that a previous project's scope commits Aaron to the same outcome here.`;

export const SERVICE_AREAS: ServiceArea[] = [
  {
    id: "ai-mvp-saas",
    name: "AI MVP & SaaS builds",
    tagline: "From idea to a working AI product",
    description:
      "Authentication, dashboards, billing, AI features and multi-tenant foundations. A production-grade first release, kept deliberately small.",
    capabilities: [
      "Product scoping and architecture",
      "Auth, billing and tenant foundations",
      "LLM feature integration",
      "Launch-ready deployment",
    ],
  },
  {
    id: "client-portals",
    name: "Client portals & dashboards",
    tagline: "A single place for your clients",
    description:
      "Client/admin views, messaging, files, approvals and reporting. Replace scattered email threads with one calm, organised surface.",
    capabilities: [
      "Role-based client and admin views",
      "Messaging and file exchange",
      "Approval workflows",
      "Reporting and activity feeds",
    ],
  },
  {
    id: "ai-automation",
    name: "AI automation systems",
    tagline: "Remove the repetitive work",
    description:
      "CRM sync, workflow automation, data pipelines and human review. Systems that quietly do the busywork while your team stays in control.",
    capabilities: [
      "Workflow and CRM automation",
      "Data pipelines and enrichment",
      "Human-in-the-loop review",
      "Monitoring and audit trails",
    ],
  },
  {
    id: "premium-product-ui",
    name: "Premium product UI",
    tagline: "Interfaces worth remembering",
    description:
      "SaaS interfaces, product demos, prototypes and design systems. Design-led frontends that make the product feel inevitable.",
    capabilities: [
      "Product UI design and build",
      "Interactive demos and prototypes",
      "Design systems",
      "Motion and micro-interaction craft",
    ],
  },
];

/** Approved public navigation only; opening the form does not send a brief or book a call. */
export const CONTACT_OPTIONS: ContactOption[] = [
  {
    id: "digital-prodigy-enquiry",
    label: "Discuss your project with Aaron",
    detail: "Open Digital Prodigy’s enquiry form.",
    href: "https://digitalprodigy.dev/contact",
    kind: "link",
  },
];

export const CONTACT_GUIDANCE = `Digital Prodigy is Aaron Archer's independent AI and full-stack engineering business.
The verified next step is Digital Prodigy's enquiry form: ${BUSINESS_PROFILE.contactSource}.
When the visitor is ready to discuss a project with Aaron, direct them to the Book view or this exact public route. They can review, copy or export their project brief and choose what to paste into the form.
Opening that page does not send the brief, submit an enquiry, book an appointment or reserve availability. The visitor submits the external form themselves; Syntra cannot verify its outcome. Never claim a submission or booking succeeded. No calendar or automatic enquiry action is connected.`;
