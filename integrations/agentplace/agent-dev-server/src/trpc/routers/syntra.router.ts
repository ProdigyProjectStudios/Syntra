import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createRouter, publicProcedure } from '../init.ts';
import type { AgentStorageFactoryService } from '../../services/agent-storage-factory.service.ts';
import { ConsultationError } from '../../bl/syntra/consultation-engine.ts';
import { SyntraConsultationRepository } from '../../bl/syntra/consultation-repository.ts';
import { verifyNativeCompletion, type NativeCompletion } from '../../bl/syntra/shared/native-completion.ts';
import type { NativeSessionGate } from '../../bl/syntra/shared/native-repository.ts';
import { CONTACT_OPTIONS } from '../../bl/syntra/shared/business.ts';
import type { BlueprintUpdateInput } from '../../bl/syntra/shared/blueprint.ts';

const idSchema = z.number().int().positive();
const depthSchema = z.enum(['concise', 'detailed', 'deep_dive']);
const briefChangesSchema = z.object({
  objective: z.string().max(4000).nullable().optional(),
  service: z.string().max(4000).nullable().optional(),
  proposedSolution: z.string().max(4000).nullable().optional(),
  requirements: z.string().max(4000).nullable().optional(),
  integrations: z.string().max(4000).nullable().optional(),
  budget: z.string().max(4000).nullable().optional(),
  timeline: z.string().max(4000).nullable().optional(),
  nextStep: z.string().max(4000).nullable().optional(),
}).strict();

const blueprintMutationSchema = z.object({ id: idSchema, version: z.number().int().nonnegative(), requestId: z.string().regex(/^[\w-]{8,100}$/) });

function handleError(operation: string, error: unknown): never {
  if (error instanceof ConsultationError) {
    throw new TRPCError({
      code: error.status === 409 ? 'CONFLICT' : error.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: error.message,
      cause: error,
    });
  }
  console.error('[Syntra] Consultation operation failed', {
    operation,
    errorName: error instanceof Error ? error.name : 'unknown',
  });
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'The consultation session could not be updated.',
    cause: error,
  });
}

/** Host implementation must read canonical native history; do not trust browser text. */
export interface NativeTurnVerifier {
  runExclusive: NativeSessionGate;
  completed(sessionKey: string, requestId: string, responseId: string): Promise<NativeCompletion | null>;
  admitted(sessionKey: string, requestId: string, responseId: string): Promise<boolean>;
}
export function createSyntraRouter(storageFactory: AgentStorageFactoryService, native: NativeTurnVerifier) {
  const repository = (sessionKey: string) =>
    new SyntraConsultationRepository(storageFactory.getStorage(sessionKey), sessionKey, native.runExclusive);

  return createRouter({
    setDepth: publicProcedure.input(z.object({ id: idSchema, depth: depthSchema })).mutation(async ({ ctx, input }) => {
      try {
        if (input.id !== 1) throw new ConsultationError(404, 'Conversation not found.');
        await repository(ctx.sessionKey).ensureSession(input.depth);
        return { saved: true };
      } catch (error) { return handleError('set-depth', error); }
    }),
    listSessions: publicProcedure.query(async ({ ctx }) => {
      try {
        return await repository(ctx.sessionKey).list();
      } catch (error) {
        return handleError('list-sessions', error);
      }
    }),

    createSession: publicProcedure.input(z.object({ depth: depthSchema })).mutation(async ({ ctx, input }) => {
      try {
        return await repository(ctx.sessionKey).ensureSession(input.depth);
      } catch (error) {
        return handleError('create-session', error);
      }
    }),

    getSession: publicProcedure.input(z.object({ id: idSchema }).optional()).query(async ({ ctx, input }) => {
      try {
        if (input?.id && input.id !== 1) throw new ConsultationError(404, 'Conversation not found.');
        return await repository(ctx.sessionKey).getSnapshot();
      } catch (error) {
        return handleError('get-session', error);
      }
    }),

    getBrief: publicProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
      try {
        return (await repository(ctx.sessionKey).get(input.id)).brief;
      } catch (error) {
        return handleError('get-brief', error);
      }
    }),

    beginTurn: publicProcedure.input(z.object({
      id: idSchema,
      requestId: z.string().min(8).max(100),
      content: z.string().min(1).max(12000),
      depth: depthSchema,
      specialist: z.enum(['syntra', 'technical', 'automation']).optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await repository(ctx.sessionKey).beginTurn(input.id, input.requestId, input.content, input.depth, input.specialist);
      } catch (error) {
        return handleError('begin-turn', error);
      }
    }),

    attachResponseId: publicProcedure.input(z.object({
      requestId: z.string().min(8).max(100),
      responseId: z.string().min(1).max(200),
    })).mutation(async ({ ctx, input }) => {
      try {
        if (!await native.admitted(ctx.sessionKey, input.requestId, input.responseId)) throw new ConsultationError(409, 'Native admission could not be verified.');
        await repository(ctx.sessionKey).attachResponseId(input.requestId, input.responseId);
        return { saved: true };
      } catch (error) {
        return handleError('attach-response-id', error);
      }
    }),

    completeTurn: publicProcedure.input(z.object({
      requestId: z.string().min(8).max(100),
      responseId: z.string().min(1).max(200),
    }).strict()).mutation(async ({ ctx, input }) => {
      try {
        const proof = verifyNativeCompletion(await native.completed(ctx.sessionKey, input.requestId, input.responseId),
          ctx.sessionKey, input.requestId, input.responseId);
        const brief = await repository(ctx.sessionKey).completeTurn(
          input.requestId,
          input.responseId,
          proof.reply,
          proof.visitorText,
        );
        return { brief };
      } catch (error) {
        return handleError('complete-turn', error);
      }
    }),

    updateBrief: publicProcedure.input(z.object({
      id: idSchema,
      changes: briefChangesSchema,
      revision: z.number().int().nonnegative(),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await repository(ctx.sessionKey).updateBrief(
          input.id,
          input.changes,
          input.revision,
        );
      } catch (error) {
        return handleError('update-brief', error);
      }
    }),

    getBlueprint: publicProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
      try { return await repository(ctx.sessionKey).getBlueprint(input.id); }
      catch (error) { return handleError('get-blueprint', error); }
    }),
    // Shared validation runs under the session lock after receipt lookup. That
    // distinguishes a correctable rejected draft from an uncertain old retry.
    updateBlueprint: publicProcedure.input(blueprintMutationSchema.extend({ edit: z.unknown() }).strict()).mutation(async ({ ctx, input }) => {
      try { return await repository(ctx.sessionKey).mutateBlueprint(input.id, { version: input.version, requestId: input.requestId, edit: input.edit as BlueprintUpdateInput['edit'] }, 'update'); }
      catch (error) { return handleError('update-blueprint', error); }
    }),
    regenerateBlueprint: publicProcedure.input(blueprintMutationSchema.strict()).mutation(async ({ ctx, input }) => {
      try { return await repository(ctx.sessionKey).mutateBlueprint(input.id, { version: input.version, requestId: input.requestId }, 'regenerate'); }
      catch (error) { return handleError('regenerate-blueprint', error); }
    }),
    contacts: publicProcedure.query(() => CONTACT_OPTIONS),
  });
}
