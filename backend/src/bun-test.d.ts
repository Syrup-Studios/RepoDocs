declare module "bun:test" {
  export function afterEach(callback: () => void): void;
  export function describe(name: string, callback: () => void): void;
  export function test(name: string, callback: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toBe(expected: unknown): void;
    toContain(expected: string): void;
    toEqual(expected: unknown): void;
  };
}
