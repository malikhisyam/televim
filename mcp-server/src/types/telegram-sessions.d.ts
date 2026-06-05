// Type declaration for telegram sessions module
declare module "telegram/sessions" {
  import { MemorySession } from "telegram/sessions/Memory";
  export class StringSession extends MemorySession {
    constructor(session?: string)
    save(): string
    load(): Promise<void>
  }
}
