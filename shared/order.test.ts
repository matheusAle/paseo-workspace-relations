import { describe, expect, it } from "vitest";
import { applySavedOrder, dropIndex, moveItem, reorderWithin } from "./order";

describe("applySavedOrder", () => {
  it("orders known keys by the saved order", () => {
    expect(applySavedOrder(["a", "b", "c"], ["c", "a", "b"], "last")).toEqual(["c", "a", "b"]);
  });

  it("puts new workspaces first, in their incoming order", () => {
    expect(applySavedOrder(["new1", "a", "new2", "b"], ["b", "a"], "first")).toEqual(["new1", "new2", "b", "a"]);
  });

  it("puts new projects last", () => {
    expect(applySavedOrder(["x", "a", "b"], ["b", "a"], "last")).toEqual(["b", "a", "x"]);
  });

  it("ignores saved keys that are gone", () => {
    expect(applySavedOrder(["a", "b"], ["gone", "b", "a"], "last")).toEqual(["b", "a"]);
  });
});

describe("reorderWithin", () => {
  it("refills the group's slots and leaves other rows in place", () => {
    // Siblings b and d swap; a (another subtree) and c (hidden) keep their slots.
    expect(reorderWithin(["a", "b", "c", "d"], ["d", "b"], [])).toEqual(["a", "d", "c", "b"]);
  });

  it("keeps saved keys that aren't displayed, after the displayed ones", () => {
    expect(reorderWithin(["a", "b"], ["b", "a"], ["filtered", "a", "b"])).toEqual(["b", "a", "filtered"]);
  });

  it("leaves the order alone when the group isn't part of it", () => {
    expect(reorderWithin(["a", "b"], ["b", "z"], [])).toEqual(["a", "b"]);
  });
});

describe("moveItem", () => {
  it("moves down and up", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
});

describe("dropIndex", () => {
  const rows = [
    { y: 0, height: 36 },
    { y: 38, height: 36 },
    { y: 76, height: 52 },
    { y: 130, height: 36 },
  ];

  it("stays put until the dragged middle passes a neighbour's middle", () => {
    expect(dropIndex(rows, 1, 0)).toBe(1);
    expect(dropIndex(rows, 1, 10)).toBe(1);
  });

  it("lands after the rows it passed going down", () => {
    expect(dropIndex(rows, 0, 90)).toBe(2);
    expect(dropIndex(rows, 0, 500)).toBe(3);
  });

  it("lands before the rows it passed going up", () => {
    expect(dropIndex(rows, 3, -60)).toBe(2);
    expect(dropIndex(rows, 3, -500)).toBe(0);
  });

  it("returns the start for an unknown row", () => {
    expect(dropIndex(rows, 9, 100)).toBe(9);
  });
});
