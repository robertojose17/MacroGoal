/** Read-only UI fencing: newer date/account/focus reads always supersede old results. */
export function createFoodsReadScope() {
  let revision = 0, active = false, owner: string | null = null;
  return {
    focus() { active = true; revision++; },
    blur() { active = false; revision++; },
    invalidate() { revision++; },
    account(next: string | null) { owner = next; revision++; },
    owner: () => owner,
    focused: () => active,
    begin() { return active ? ++revision : null; },
    bind(token: number, actor: string) {
      if (!active || token !== revision || !actor) return false;
      owner = actor; return true;
    },
    current(token: number, actor?: string) {
      return active && token === revision && (actor === undefined || actor === owner);
    },
  };
}
/** Null is unavailable, zero is a valid accepted macro target, never divide by zero. */
export function foodsMacroPercentage(eaten: number, goal: number | null): number | null {
  if (goal === null || !Number.isFinite(goal) || goal < 0 || !Number.isFinite(eaten)) return null;
  return goal === 0 ? 0 : Math.min(Math.max(eaten / goal * 100, 0), 100);
}
