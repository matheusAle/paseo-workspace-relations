import { describe, expect, it } from "vitest";
import { buildForest, someInTree } from "./relations";

describe("buildForest", () => {
  it("nests children under parents and keeps sibling order", () => {
    const forest = buildForest(
      ["root", "b", "a", "grandchild", "other"],
      new Map([
        ["a", "root"],
        ["b", "root"],
        ["grandchild", "a"],
      ]),
    );
    expect(forest).toEqual([
      {
        key: "root",
        children: [
          { key: "b", children: [] },
          { key: "a", children: [{ key: "grandchild", children: [] }] },
        ],
      },
      { key: "other", children: [] },
    ]);
  });

  it("makes a workspace whose parent isn't listed a root", () => {
    expect(buildForest(["child"], new Map([["child", "archived"]]))).toEqual([{ key: "child", children: [] }]);
  });

  it("breaks a cycle instead of dropping its members", () => {
    const forest = buildForest(
      ["a", "b"],
      new Map([
        ["a", "b"],
        ["b", "a"],
      ]),
    );
    expect(forest.map((node) => node.key)).toEqual(["a"]);
    expect(forest[0].children.map((node) => node.key)).toEqual(["b"]);
  });
});

describe("someInTree", () => {
  it("finds a key anywhere in the subtree", () => {
    const [root] = buildForest(["r", "c"], new Map([["c", "r"]]));
    expect(someInTree(root, (key) => key === "c")).toBe(true);
    expect(someInTree(root, (key) => key === "x")).toBe(false);
  });
});
