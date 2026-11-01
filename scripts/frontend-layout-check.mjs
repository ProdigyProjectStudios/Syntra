/** Actual browser layout/accessibility checks using an explicit in-memory runtime.
 * These fixtures do not verify model quality, Azure, native AgentPlace, or real audio. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const moduleName = process.env.SYNTRA_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(
  path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName
);
const base = process.env.SYNTRA_CHECK_URL || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) {
  throw new Error(
    "Synthetic runtime checks require a local preview; never inject them into production.",
  );
}
const out = path.resolve(
  process.env.SYNTRA_LAYOUT_OUTPUT || "generated-artifacts/frontend-hardening",
);
fs.mkdirSync(out, { recursive: true });
const { build } = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
)("esbuild");
const domainBundle = await build({
  stdin: {
    contents:
      "export { emptyBlueprint, evolveBlueprint } from './lib/consultation/src/blueprint.ts';",
    resolveDir: path.resolve("."),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  globalName: "SyntraLayoutDomain",
  logLevel: "silent",
});
async function fixture(page) {
  const install = (domain) => {
    const fields = {
      objective: "A unified approval portal for our production studio.",
      service: "Client portals & dashboards",
      proposedSolution: "A scoped approval workflow with role-based access.",
      requirements:
        "Review projects, approve versions, and keep an audit trail.",
      integrations: "Existing project management system; verify API access.",
      budget: "To be discussed",
      timeline: "Pilot this quarter, subject to scope.",
      nextStep:
        "Review this brief and enquire through the approved contact form.",
    };
    const brief = {
      ...fields,
      revision: 1,
      provenance: Object.fromEntries(
        Object.keys(fields).map((k) => [
          k,
          { status: "suggested", evidence: "" },
        ]),
      ),
    };
    const conversation = {
      id: 1,
      title: "Browser layout fixture",
      depth: "detailed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: sessionStorage.getItem("syntra.layout.history")
        ? [
            {
              id: 1,
              role: "visitor",
              content:
                "Our production studio needs a unified approval portal. Project managers chase revisions by email.",
              depth: "detailed",
              createdAt: new Date().toISOString(),
            },
            {
              id: 2,
              role: "advisor",
              content:
                "A focused approval workflow could make ownership and the next action visible. Who signs off a final version?",
              depth: "detailed",
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
      brief,
    };
    const blueprint = domain.evolveBlueprint(
      domain.emptyBlueprint(),
      brief,
      [
        {
          section: "architecture",
          id: "layout-data-boundary",
          title: "A deliberate data boundary",
          detail:
            "Keep client approvals, internal review notes and integration jobs separately authorized. This is an explicitly synthetic browser layout example.",
          status: "recommendation",
          evidence: "",
          details: [
            {
              label: "Data flow",
              value:
                "Project coordinator → validated review request → authorized client reviewer → saved decision → controlled integration job.",
            },
          ],
        },
      ],
      { visitorHistory: [], latest: "", specialist: "technical" },
    );
    window.__SYNTRA_LAYOUT_FIXTURE__ = true;
    window.__SYNTRA_RUNTIME__ = {
      sessions: {
        list: async () => [{ ...conversation, messageCount: 0 }],
        create: async () => conversation,
        get: async () => conversation,
        setDepth: async () => {},
      },
      messages: {
        send: async () => {
          throw Error("No model configured in layout fixture.");
        },
      },
      briefs: { get: async () => brief, update: async () => brief },
      blueprints: {
        get: async () => structuredClone(blueprint),
        regenerate: async () => structuredClone(blueprint),
        update: async () => {
          throw new Error("Editing is covered by the workflow fixture.");
        },
      },
      services: async () => [],
      booking: { contacts: async () => [] },
      voice: {
        available: true,
        specialists: ["syntra", "technical", "automation"],
        prepare(signal) {
          window.__prepareCount = (window.__prepareCount || 0) + 1;
          window.__preparedWithGesture = navigator.userActivation.isActive;
          window.__preparationAborted = false;
          signal.addEventListener(
            "abort",
            () => {
              window.__preparationAborted = true;
            },
            { once: true },
          );
        },
        connect: async (id, emit, signal) => {
          if (window.__failNextConnect) {
            window.__failNextConnect = false;
            throw Error("Fixture connection failure");
          }
          window.__voiceEmit = emit;
          emit({ type: "state", state: "listening" });
          return {
            close() {
              emit({ type: "state", state: "closed" });
            },
            setMuted() {},
            interrupt() {
              emit({ type: "state", state: "listening" });
            },
            setSpecialist(id) {
              emit({ type: "specialist", specialist: id });
            },
            canSwitchSpecialist: () => true,
          };
        },
      },
    };
  };
  await page.addInitScript({ content: domainBundle.outputFiles[0].text + "\n;(" + install.toString() + ")(SyntraLayoutDomain);" });
}
(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const results = [];
  let activePage;
  let activeWidth;
  let activeErrors = [];
  let activeConsoleErrors = [];
  try {
    for (const [width, height] of [
      [320, 568],
      [375, 812],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      activePage = page; activeWidth = width; activeConsoleErrors = [];
      page.on("console", message => { if (message.type() === "error") activeConsoleErrors.push(message.text()); });
      await fixture(page);
      const errors = [];
      activeErrors = errors;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__SYNTRA_LAYOUT_FIXTURE__ === true);
      await page.getByTestId("input-message").waitFor();
      await page.waitForTimeout(800);
      const entry = await page.evaluate(() => ({
        width: innerWidth,
        platforms: document.querySelector('[data-testid="platform-orbs"]').getBoundingClientRect().toJSON(),
        scrollWidth: document.documentElement.scrollWidth,
        composer: document
          .querySelector('[data-testid="input-message"]')
          .getBoundingClientRect()
          .toJSON(),
        nav: [...document.querySelectorAll('nav[aria-label="Experiences"] a')]
          .filter((n) => n.getBoundingClientRect().width)
          .map((n) => ({
            label: n.getAttribute("aria-label"),
            current: n.getAttribute("aria-current"),
          })),
      }));
      assert.equal(
        entry.scrollWidth,
        width,
        `Horizontal overflow at ${width}px`,
      );
      assert(Math.abs((entry.platforms.left + entry.platforms.right) / 2 - width / 2) <= 2,
        `Platform orbs are not centered in the page at ${width}px`);
      assert(
        entry.composer.bottom <= height,
        `Composer outside viewport at ${width}px`,
      );
      assert.deepEqual(
        entry.nav.map((item) => item.label),
        ["Discover", "Solutions", "Project Brief", "Book"],
      );
      assert.equal(
        entry.nav.filter((item) => item.current === "page").length,
        1,
      );
      await page.screenshot({ path: `${out}/${width}-discover.png` });
      await page.getByTestId("button-depth-toggle").focus();
      await page.keyboard.press("ArrowLeft");
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "radio");
      await page.keyboard.press("ArrowRight");
      const depth = await page
        .locator('[role="radio"][aria-checked="true"]')
        .getAttribute("aria-label");
      assert.equal(depth, "Deep dive");
      await page
        .getByTestId(
          width >= 1024 ? "button-open-history-rail" : "button-open-history",
        )
        .click();
      await page.waitForTimeout(400);
      const history = await page.evaluate(() => ({
        role: document
          .querySelector('[aria-labelledby="syntra-history-title"]')
          ?.getAttribute("role"),
        focus: document.activeElement?.getAttribute("data-testid"),
        inert: document.querySelector(".contents")?.inert,
      }));
      assert.deepEqual(errors, [], "Browser exception before history dialog check");
      assert.deepEqual(history, {
        role: "dialog",
        focus: "button-close-history",
        inert: true,
      });
      for (let tab = 0; tab < 8; tab++) {
        await page.keyboard.press("Tab");
        assert(
          await page.evaluate(() =>
            document
              .querySelector('[aria-labelledby="syntra-history-title"]')
              ?.contains(document.activeElement),
          ),
          "History focus escaped the modal",
        );
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.locator('canvas[data-visual-layer="ambient"]').waitFor();
      const instrumented = await page.evaluate(() => {
        // The interaction canvas sits above the modal and must keep rendering.
        // Classifying every preexisting canvas as covered made a slow click burst
        // look like a background regression. Scope by ownership, not elapsed time.
        const consultation = [...document.querySelectorAll(".contents canvas")];
        const ambient = [
          ...document.querySelectorAll('canvas[data-visual-layer="ambient"]'),
        ];
        const interaction = [
          ...document.querySelectorAll(
            'canvas[data-visual-layer="interaction"]',
          ),
        ];
        const covered = new WeakSet([...consultation, ...ambient]);
        const foreground = new WeakSet(interaction);
        window.__backgroundDraws = 0;
        window.__foregroundDraws = 0;
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          if (covered.has(this.canvas)) window.__backgroundDraws++;
          if (foreground.has(this.canvas)) window.__foregroundDraws++;
          return draw.apply(this, args);
        };
        return {
          consultation: consultation.length,
          ambient: ambient.length,
          interaction: interaction.length,
        };
      });
      assert(
        instrumented.consultation > 0,
        "No consultation canvases were instrumented",
      );
      assert.equal(
        instrumented.ambient,
        1,
        "Ambient canvas missing from pause check",
      );
      assert.equal(
        instrumented.interaction,
        1,
        "Visible interaction canvas missing",
      );
      await page
        .getByTestId("button-speak-mobile")
        .click();
      await page.waitForTimeout(600);
      await page.evaluate(() =>
        window.__voiceEmit({
          type: "transcript",
          role: "advisor",
          id: "fixture",
          final: true,
          text: "This is a browser layout fixture, not synthesized audio. We can start with a focused approval workflow and then validate the integration boundary. Which system holds your current projects? ".repeat(
            5,
          ),
        }),
      );
      await page.waitForTimeout(400);
      const voice = await page.evaluate(() => {
        const rect = (s) =>
          document.querySelector(s)?.getBoundingClientRect().toJSON();
        return {
          dialog: rect('[aria-label="Syntra voice conversation"]'),
          transcript: rect('[data-testid="voice-transcript"]'),
          controls: rect('[data-testid="button-end-voice"]'),
          rail: rect('[data-testid="voice-specialist-rail"]'),
          core: rect('[data-testid="voice-primary-core"]'),
          focus: document.activeElement?.getAttribute("data-testid"),
          inert: document.querySelector(".contents")?.inert,
        };
      });
      assert.equal(voice.dialog.width, width);
      assert.equal(voice.dialog.height, height);
      assert(
        voice.transcript.bottom <= voice.controls.top,
        `Voice transcript overlaps controls at ${width}px`,
      );
      assert(
        voice.transcript.top >= voice.rail.bottom || width >= 640,
        `Voice transcript overlaps specialist rail at ${width}px`,
      );
      assert.equal(voice.focus, "button-close-voice");
      assert.equal(voice.inert, true);
      assert(voice.rail.top <= 24, `Specialist orbs are not at the top at ${width}px`);
      assert(Math.abs((voice.rail.left + voice.rail.right) / 2 - width / 2) <= 2,
        `Specialist orbs are not centered at ${width}px`);
      assert(Math.abs((voice.rail.left + voice.rail.right - voice.core.left - voice.core.right) / 2) <= 2,
        `Specialist orbs are not aligned with the main sphere at ${width}px`);
      assert.equal(await page.getByTestId("button-expand-specialists").count(), 0);
      assert.equal(await page.getByTestId("button-collapse-specialists").count(), 0);
      await page.getByTestId("button-voice-specialist-automation").hover();
      await page.getByTestId("voice-specialist-tooltip").waitFor();
      const hover = await page.getByTestId("voice-specialist-tooltip").boundingBox();
      for (const specialist of ["syntra", "technical", "automation", "syntra", "automation"]) {
        await page.getByTestId(`button-voice-specialist-${specialist}`).hover();
        const samples = await page.evaluate(async () => {
          const positions = [];
          for (let frame = 0; frame < 12; frame++) {
            positions.push(...[...document.querySelectorAll('[data-testid="voice-specialist-tooltip"]')]
              .map(element => element.getBoundingClientRect().top));
            await new Promise(requestAnimationFrame);
          }
          return positions;
        });
        assert(samples.length > 0 && samples.every(top => Math.abs(top - hover.y) <= 2),
          `Specialist hover panels jump during transitions at ${width}px`);
      }
      assert(hover.x >= 0 && hover.x + hover.width <= width, `Hover panel overflows at ${width}px`);
      assert(hover.y + hover.height < height / 2, `Hover panel covers central orb at ${width}px`);
      await page.screenshot({ path: `${out}/${width}-voice-hover.png` });
      await page.getByTestId("button-voice-specialist-automation").focus();
      await page.keyboard.press("Escape");
      await page.getByTestId("voice-specialist-tooltip").waitFor({ state: "detached" });
      assert.equal(await page.getByTestId("voice-specialist-tooltip").count(), 0);
      assert(
        await page.evaluate(() => window.__preparedWithGesture),
        "Audio preparation lost the opening gesture",
      );
      await page.evaluate(() => {
        window.__backgroundDraws = 0;
        window.__foregroundDraws = 0;
      });
      // Deliberately trigger visible click feedback during the pause observation.
      // Re-selecting the current specialist leaves the voice session unchanged.
      await page.getByTestId("button-voice-specialist-syntra").click();
      await page.waitForFunction(() => window.__foregroundDraws > 0);
      await page.waitForTimeout(300);
      voice.instrumentedCanvases = instrumented;
      voice.coveredCanvasDraws = await page.evaluate(
        () => window.__backgroundDraws,
      );
      voice.foregroundCanvasDraws = await page.evaluate(
        () => window.__foregroundDraws,
      );
      assert.equal(
        voice.coveredCanvasDraws,
        0,
        "Covered canvases should pause while voice is open",
      );
      assert(
        voice.foregroundCanvasDraws > 0,
        "Visible click feedback did not render above voice",
      );
      await page.getByTestId("button-close-voice").focus();
      await page.screenshot({ path: `${out}/${width}-voice.png` });
      await page.getByTestId("button-close-voice").click();
      await page.waitForTimeout(500);
      const restored = await page.evaluate(() => ({
        focus: document.activeElement?.getAttribute("data-testid"),
        inert: document.querySelector(".contents")?.inert,
      }));
      assert.equal(
        restored.focus,
        "button-speak-mobile",
      );
      assert.equal(restored.inert, false);
      assert(
        await page.evaluate(() => window.__preparationAborted),
        "Closing voice did not retire preparation",
      );
      await page.evaluate(() => {
        window.__failNextConnect = true;
      });
      await page
        .getByTestId("button-speak-mobile")
        .click();
      await page.getByTestId("button-retry-voice").waitFor();
      assert(
        await page.evaluate(() => window.__preparationAborted),
        "Failed connection retained preparation",
      );
      await page.getByTestId("button-retry-voice").click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="status-voice-state"]')
            ?.textContent === "Listening",
      );
      assert(
        await page.evaluate(() => window.__preparedWithGesture),
        "Reconnect lost its activation gesture",
      );
      await page.getByTestId("button-close-voice").click();
      await page.waitForTimeout(500);
      assert(
        await page.evaluate(() => window.__preparationAborted),
        "Reconnect preparation leaked after close",
      );
      await page.evaluate(() =>
        sessionStorage.setItem("syntra.layout.history", "1"),
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByTestId("text-specialist-switch").waitFor();
      await page.getByTestId("button-text-specialist-technical").click();
      assert.equal(
        await page
          .getByTestId("button-text-specialist-technical")
          .getAttribute("aria-checked"),
        "true",
      );
      assert.match(
        await page.getByTestId("input-message").getAttribute("placeholder"),
        /Kryon/,
      );
      const specialistGeometry = await page
        .getByTestId("text-specialist-switch")
        .boundingBox();
      assert(
        specialistGeometry.x >= 0 &&
          specialistGeometry.x + specialistGeometry.width <= width,
        "Specialist controls overflow",
      );
      await page.getByTestId("button-depth-toggle").click();
      if (width >= 640) {
        await page.waitForTimeout(350);
        const triggerBox = await page.getByTestId("button-depth-toggle").boundingBox();
        const choicesBox = await page.getByRole("radiogroup", { name: "Response depth" }).boundingBox();
        // Move slowly through the visible gap, not directly onto a choice.
        await page.mouse.move((choicesBox.x + choicesBox.width + triggerBox.x) / 2,
          triggerBox.y + triggerBox.height / 2, { steps: 8 });
        await page.waitForTimeout(350);
        assert.equal(await page.getByTestId("button-depth-toggle").getAttribute("aria-expanded"), "true",
          "Crossing the gap must not close the depth selector");
      }
      await page.getByTestId("button-depth-deep_dive").click();
      await page
        .getByTestId(width >= 1024 ? "link-project-brief" : "link-m-03")
        .click();
      await page.getByTestId("tab-solution-blueprint").click();
      await page.getByTestId("solution-blueprint").waitFor();
      const blueprintLayout = await page.evaluate(() => {
        const measure = (testId) => document.querySelector(`[data-testid="${testId}"]`).getBoundingClientRect().toJSON();
        const heading = document.querySelector('[data-testid="blueprint-hero-heading"]');
        return {
          width: document.documentElement.scrollWidth,
          hero: document.querySelector('[data-testid="solution-blueprint"]').firstElementChild.getBoundingClientRect().toJSON(),
          heading: measure("blueprint-hero-heading"),
          headingLineHeight: parseFloat(getComputedStyle(heading).lineHeight),
          copy: measure("blueprint-hero-copy"),
          actions: measure("blueprint-hero-actions"),
          routeLabel: measure("text-route-label"),
          sections: [
            ...document.querySelectorAll('[data-testid^="blueprint-section-"]'),
          ].map((element) => ({
            id: element.getAttribute("data-testid"),
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
          })),
        };
      });
      assert.equal(
        blueprintLayout.width,
        width,
        "Blueprint causes horizontal overflow",
      );
      assert.equal(blueprintLayout.sections.length, 10);
      assert(
        blueprintLayout.sections.every(
          (section) => section.left >= 0 && section.right <= width + 1,
        ),
        "Blueprint sections exceed viewport",
      );
      if (width < 640) {
        assert(
          blueprintLayout.heading.width >= blueprintLayout.hero.width - 44,
          "Mobile Blueprint title must retain the card's full readable width",
        );
        assert(
          blueprintLayout.actions.top >= blueprintLayout.copy.bottom + 12,
          "Mobile export actions must stack below the Blueprint introduction",
        );
        assert(
          blueprintLayout.heading.height <= blueprintLayout.headingLineHeight * 3 + 1,
          "Mobile Blueprint heading wraps into too many lines",
        );
        assert(
          blueprintLayout.routeLabel.height <= 20,
          "Compact route label must not wrap into narrow fragments",
        );
      }
      await page.screenshot({ path: `${out}/${width}-blueprint.png` });
      voice.blueprintLayout = blueprintLayout;
      voice.specialistGeometry = specialistGeometry;
      await page.getByRole("link", { name: "Book", exact: true }).click();
      await page.getByTestId("button-toggle-dossier").waitFor();
      await page.waitForTimeout(600);
      if ((await page.locator('details[aria-label="Project dossier"]').getAttribute("open")) === null) {
        await page.getByTestId("button-toggle-dossier").click();
      }
      await page.waitForTimeout(400);
      const handoffOverflow = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="syntra-handoff"]');
        return [root, ...root.querySelectorAll("*")]
          .filter(element => element.clientWidth > 0 &&
            !element.closest('[aria-hidden="true"]') &&
            !["absolute", "fixed"].includes(getComputedStyle(element).position) &&
            !["hidden", "clip"].includes(getComputedStyle(element).overflowX) &&
            element.scrollWidth > element.clientWidth + 1)
          .map(element => ({
            tag: element.tagName,
            testId: element.getAttribute("data-testid"),
            width: element.clientWidth,
            content: element.scrollWidth,
          }));
      });
      assert.deepEqual(handoffOverflow, [], `Nested Book overflow at ${width}px`);
      await page.screenshot({ path: `${out}/${width}-book.png` });
      // Browser-level viewport shrink emulates keyboard geometry only; no physical keyboard claim.
      if (width < 640) {
        await page.setViewportSize({ width, height: Math.round(height * 0.6) });
        await page.waitForTimeout(150);
        entry.keyboardGeometry = await page
          .getByTestId("input-message")
          .boundingBox();
        entry.keyboardViewport = Math.round(height * 0.6);
        assert(
          entry.keyboardGeometry.y + entry.keyboardGeometry.height <=
            entry.keyboardViewport,
          "Composer hidden in resized viewport",
        );
      }
      assert.deepEqual(errors, []);
      results.push({
        width,
        height,
        entry,
        depth,
        history,
        voice,
        restored,
        errors,
      });
      await context.close();
    }
    fs.writeFileSync(
      `${out}/layout-results.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: `${out}/${activeWidth}-failure.png` }).catch(() => {});
      const body = await activePage.locator('body').innerText().catch(() => 'Body unavailable');
      fs.writeFileSync(`${out}/failure.json`, JSON.stringify({ width: activeWidth, error: String(error), pageErrors: activeErrors, consoleErrors: activeConsoleErrors, body: body.slice(0, 4000) }, null, 2));
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
