export const SERVICE_AREAS = [
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

// Do not present guessed addresses as verified business destinations.
// AgentPlace's booking/contact adapter supplies approved channels when connected.
export const CONTACT_OPTIONS: import("@workspace/consultation").ContactOption[] = [];
