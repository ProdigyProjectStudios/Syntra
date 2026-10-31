import type { AgentStorage } from '../agent/agent-library.ts';
import { SyntraConsultationRepository as PortableRepository } from './shared/native-repository.ts';
import type { NativeSessionGate } from './shared/native-repository.ts';
export class SyntraConsultationRepository extends PortableRepository {
  constructor(storage: AgentStorage, trustedSessionKey: string, gate: NativeSessionGate) {
    if (!gate) throw new Error('Register the native atomic session gate before using Syntra storage.');
    super({
      readFile: async path => (await storage.readFile(path)).toString('utf8'),
      writeFile: (path, content) => storage.writeFile(path, Buffer.from(content, 'utf8')),
    }, trustedSessionKey, gate);
  }
}
export { blankBrief } from './shared/native-repository.ts';
