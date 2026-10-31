import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  DEPTH_GUIDANCE,
  ConsultationError,
  manualBrief,
  mergeBrief,
} from './consultation-engine.ts';
import { blankBrief } from './consultation-repository.ts';
import { BRIEF_KEYS } from './consultation-types.ts';
import type { AdvisorResult, Brief } from './consultation-types.ts';

const empty = (): Brief => blankBrief();

describe('Syntra consultation brief', () => {
  it('requires visitor evidence and keeps provenance for accepted facts', () => {
    const result: AdvisorResult = {
      reply: 'A small client portal sounds like a possible direction.',
      changes: {
        objective: {
          value: 'Reduce manual intake work',
          status: 'confirmed',
          evidence: 'I want to reduce manual intake work',
        },
      },
      suggestedNextSteps: [],
    };
    const brief = mergeBrief(empty(), result, ['I want to reduce manual intake work'], 'I want to reduce manual intake work');

    assert.equal(brief.objective, 'Reduce manual intake work');
    assert.deepEqual(brief.provenance.objective, {
      status: 'confirmed',
      evidence: 'I want to reduce manual intake work',
    });
    assert.equal(brief.revision, 1);
  });

  it('rejects fabricated evidence and unsupported suggested factual fields', () => {
    const result: AdvisorResult = {
      reply: 'We could begin with a short validation project.',
      changes: {
        budget: {
          value: '$10,000',
          status: 'confirmed',
          evidence: 'My budget is $10,000',
        },
        timeline: {
          value: 'Six weeks',
          status: 'suggested',
          evidence: 'I hope to launch this quarter',
        },
      },
      suggestedNextSteps: [],
    };
    const brief = mergeBrief(empty(), result, ['I hope to launch this quarter'], 'I hope to launch this quarter');

    assert.equal(brief.budget, null, 'fabricated quote is not found in visitor history');
    assert.equal(brief.timeline, null, 'advisor cannot suggest a timeline as a fact');
    assert.equal(brief.revision, 0);
  });

  it('protects manual edits until the visitor explicitly corrects the same field', () => {
    const edited = manualBrief(empty(), { objective: 'Reduce intake time' }, 0);
    const suggestion: AdvisorResult = {
      reply: 'A scheduling tool could help.',
      changes: {
        objective: {
          value: 'Increase revenue',
          status: 'confirmed',
          evidence: 'We want an intake tool',
        },
      },
      suggestedNextSteps: [],
    };
    const preserved = mergeBrief(edited, suggestion, ['We want an intake tool'], 'We want an intake tool');
    assert.equal(preserved.objective, 'Reduce intake time');
    assert.equal(preserved.provenance.objective?.status, 'manual');

    const correctionText = 'Actually, change the objective to reduce admin time';
    const corrected = mergeBrief(
      preserved,
      {
        reply: 'Understood.',
        changes: {
          objective: {
            value: 'Reduce admin time',
            status: 'confirmed',
            evidence: correctionText,
          },
        },
        suggestedNextSteps: [],
      },
      [correctionText],
      correctionText,
    );
    assert.equal(corrected.objective, 'Reduce admin time');
    assert.equal(corrected.provenance.objective?.status, 'confirmed');
  });

  it('makes repeated manual saves idempotent and rejects stale revisions', () => {
    const first = manualBrief(empty(), { timeline: 'Next quarter' }, 0);
    const repeated = manualBrief(first, { timeline: 'Next quarter' }, first.revision);

    assert.equal(first.revision, 1);
    assert.equal(repeated.revision, 1);
    assert.throws(
      () => manualBrief(first, { timeline: 'Later' }, 0),
      (error) => error instanceof ConsultationError && error.status === 409,
    );
  });

  it('validates evidence and provenance across all eight brief fields', () => {
    const visitorText = 'I want a stable intake process; we provide a client portal; we could start with a small MVP; requirements: staff approval; connect to Slack; budget is $8,000; timeline is 10 weeks; next step: review a prototype.';
    const result: AdvisorResult = {
      reply: 'A small portal could validate the intake workflow.',
      changes: {
        objective: { value: 'Stable intake process', status: 'confirmed', evidence: 'I want a stable intake process' },
        service: { value: 'Client portal', status: 'confirmed', evidence: 'we provide a client portal' },
        proposedSolution: { value: 'Small MVP', status: 'suggested', evidence: 'we could start with a small MVP' },
        requirements: { value: 'Staff approval', status: 'confirmed', evidence: 'requirements: staff approval' },
        integrations: { value: 'Slack', status: 'confirmed', evidence: 'connect to Slack' },
        budget: { value: '$8,000', status: 'confirmed', evidence: 'budget is $8,000' },
        timeline: { value: '10 weeks', status: 'confirmed', evidence: 'timeline is 10 weeks' },
        nextStep: { value: 'Review a prototype', status: 'suggested', evidence: 'next step: review a prototype' },
      },
      suggestedNextSteps: [],
    };
    const brief = mergeBrief(empty(), result, [visitorText], visitorText);

    assert.deepEqual(BRIEF_KEYS.filter((key) => brief[key] !== null), [...BRIEF_KEYS]);
    assert.deepEqual(BRIEF_KEYS.map((key) => brief.provenance[key]?.status), [
      'confirmed', 'confirmed', 'suggested', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'suggested',
    ]);
    assert.equal(brief.revision, 1);
  });

  it('preserves a manually cleared field until the visitor explicitly corrects it', () => {
    const cleared = manualBrief(empty(), { budget: null }, 0);
    const ordinaryTurn = 'We are discussing the onboarding workflow.';
    const preserved = mergeBrief(
      cleared,
      {
        reply: 'A small pilot may be a sensible starting point.',
        changes: { budget: { value: '$8,000', status: 'confirmed', evidence: 'My budget is $8,000' } },
        suggestedNextSteps: [],
      },
      [ordinaryTurn, 'My budget is $8,000'],
      ordinaryTurn,
    );
    assert.equal(preserved.budget, null);
    assert.equal(preserved.provenance.budget?.status, 'manual');

    const correction = 'Actually, clear the budget; we have no budget.';
    const corrected = mergeBrief(
      preserved,
      {
        reply: 'Understood.',
        changes: { budget: { value: null, status: 'confirmed', evidence: correction } },
        suggestedNextSteps: [],
      },
      [correction],
      correction,
    );
    assert.equal(corrected.budget, null);
    assert.equal(corrected.provenance.budget?.status, 'confirmed');
    assert.equal(corrected.revision, preserved.revision + 1);
  });

  it('provides meaningfully different response-depth guidance', () => {
    assert.match(DEPTH_GUIDANCE.concise, /At most three short sentences/);
    assert.match(DEPTH_GUIDANCE.detailed, /key trade-off/);
    assert.match(DEPTH_GUIDANCE.deep_dive, /architectural\/integration dependencies/);
  });
});
