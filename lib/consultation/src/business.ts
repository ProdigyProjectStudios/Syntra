import type { ContactOption, ServiceArea } from "./types.ts";

/**
 * Public business facts reviewed on 2026-10-31 against Digital Prodigy's website.
 * Its "Book a Build Call" route opens /contact, an enquiry form, not a calendar.
 * This catalogue is shared by development and the deterministic native transfer.
 */
export const BUSINESS_PROFILE = {
  name: "Digital Prodigy",
  consultant: "Aaron Archer",
  website: "https://digitalprodigy.dev",
  contactSource: "https://digitalprodigy.dev/contact",
  contactVerifiedOn: "2026-10-31",
} as const;

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
