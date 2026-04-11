/**
 * Command interface — every command module must export a default satisfying this.
 */
export interface Command {
  name: string;
  description: string;
  run(args: string[]): Promise<void>;
}
