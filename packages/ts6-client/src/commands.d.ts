export declare function tsEscape(str: string): string;
export declare function tsUnescape(str: string): string;
export interface ParsedCommand {
    name: string;
    params: Record<string, string>;
    groups?: Record<string, string>[];
}
export declare function buildCommand(name: string, params: Record<string, string | number | boolean | undefined>): string;
export declare function parseCommand(raw: string): ParsedCommand;
//# sourceMappingURL=commands.d.ts.map