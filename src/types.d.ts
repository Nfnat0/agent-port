declare module "@iarna/toml" {
  export function parse(input: string): unknown;
  export function stringify(input: unknown): string;
}
