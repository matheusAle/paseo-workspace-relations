export interface RelationNode {
  readonly key: string;
  readonly children: readonly RelationNode[];
}

const MAX_DEPTH = 8;

/**
 * Builds the relation forest from keys in display order and a key -> parent key map. Siblings keep
 * the order of `keys`. A parent outside `keys` (archived, filtered out), a cycle, or a chain deeper
 * than the cap makes the workspace a root rather than hiding it.
 */
export function buildForest(
  keys: readonly string[],
  parentOf: ReadonlyMap<string, string | null>,
): RelationNode[] {
  const inSet = new Set(keys);
  const childrenOf = new Map<string | null, string[]>();
  for (const key of keys) {
    const rawParent = parentOf.get(key) ?? null;
    const parent = rawParent && inSet.has(rawParent) ? rawParent : null;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(key);
    else childrenOf.set(parent, [key]);
  }

  const visited = new Set<string>();
  function build(key: string, depth: number): RelationNode {
    visited.add(key);
    const children: RelationNode[] = [];
    if (depth < MAX_DEPTH) {
      for (const child of childrenOf.get(key) ?? []) {
        if (!visited.has(child)) children.push(build(child, depth + 1));
      }
    }
    return { key, children };
  }

  const roots: RelationNode[] = [];
  for (const key of childrenOf.get(null) ?? []) roots.push(build(key, 0));
  for (const key of keys) if (!visited.has(key)) roots.push(build(key, 0));
  return roots;
}

export function someInTree(node: RelationNode, test: (key: string) => boolean): boolean {
  return test(node.key) || node.children.some((child) => someInTree(child, test));
}
