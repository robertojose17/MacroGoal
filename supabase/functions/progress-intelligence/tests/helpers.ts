export function assertApprox(failures: string[], field: string, actual: number | null | undefined, expected: number, tolerance: number) {
  if (actual === null || actual === undefined || Math.abs(actual - expected) > tolerance) {
    failures.push(`${field}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

export function assertEq(failures: string[], field: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    failures.push(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertNull(failures: string[], field: string, actual: unknown) {
  if (actual !== null && actual !== undefined) {
    failures.push(`${field}: expected null/undefined, got ${JSON.stringify(actual)}`);
  }
}

export function assertIncludes(failures: string[], field: string, arr: unknown[], value: unknown) {
  if (!arr.includes(value)) {
    failures.push(`${field}: expected array to include ${JSON.stringify(value)}, got ${JSON.stringify(arr)}`);
  }
}

export function assertNotIncludes(failures: string[], field: string, arr: unknown[], value: unknown) {
  if (arr.includes(value)) {
    failures.push(`${field}: expected array NOT to include ${JSON.stringify(value)}, got ${JSON.stringify(arr)}`);
  }
}

export function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export interface TestResult {
  name: string;
  passed: boolean;
  failures: string[];
  outputs: Record<string, unknown>;
}
