/**
 * Puts `keys` in the order a saved manual order gives them. Keys the saved order doesn't know keep
 * their incoming order and go first (new workspaces, like the app) or last (new projects).
 */
export function applySavedOrder(
  keys: readonly string[],
  saved: readonly string[],
  unknown: "first" | "last",
): string[] {
  const position = new Map(saved.map((key, index) => [key, index] as const));
  const known = keys
    .filter((key) => position.has(key))
    .sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
  const rest = keys.filter((key) => !position.has(key));
  return unknown === "first" ? [...rest, ...known] : [...known, ...rest];
}

/**
 * The saved order after a drag reordered `group`, a subset of `displayed` (one list's visible
 * siblings). The group's keys refill the slots they held, so rows outside the group (hidden by
 * "Show more", in another subtree) stay where they were. Saved keys that aren't displayed right
 * now (filtered out, archived) keep their place at the end.
 */
export function reorderWithin(
  displayed: readonly string[],
  group: readonly string[],
  saved: readonly string[],
): string[] {
  const members = new Set(group);
  const slots = displayed.filter((key) => members.has(key));
  if (slots.length !== group.length) return [...displayed];
  let next = 0;
  const result = displayed.map((key) => (members.has(key) ? group[next++] : key));
  const seen = new Set(result);
  for (const key of saved) {
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

/**
 * Where a dragged item lands: the number of other items whose middle is above the dragged item's
 * middle. `layouts` are the items' positions in list order.
 */
export function dropIndex(
  layouts: readonly { y: number; height: number }[],
  from: number,
  dy: number,
): number {
  const dragged = layouts[from];
  if (!dragged) return from;
  const middle = dragged.y + dragged.height / 2 + dy;
  let index = 0;
  layouts.forEach((layout, position) => {
    if (position !== from && layout.y + layout.height / 2 < middle) index += 1;
  });
  return index;
}
