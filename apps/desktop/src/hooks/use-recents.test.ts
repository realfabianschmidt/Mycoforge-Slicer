import { describe, expect, it } from "vitest";
import { pushRecent, type RecentFile } from "./use-recents";

describe("pushRecent", () => {
  it("prepends a new entry with name and timestamp", () => {
    const result = pushRecent([], "H:\\models\\part.stl", 1000);
    expect(result).toEqual([{ path: "H:\\models\\part.stl", name: "part.stl", ts: 1000 }]);
  });

  it("dedupes by path and moves the re-opened file to the front", () => {
    const list: RecentFile[] = [
      { path: "/a.stl", name: "a.stl", ts: 1 },
      { path: "/b.stl", name: "b.stl", ts: 2 }
    ];
    const result = pushRecent(list, "/b.stl", 3);
    expect(result.map((r) => r.path)).toEqual(["/b.stl", "/a.stl"]);
    expect(result[0].ts).toBe(3);
  });

  it("caps the list at eight entries", () => {
    let list: RecentFile[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, `/file-${i}.stl`, i);
    expect(list).toHaveLength(8);
    expect(list[0].path).toBe("/file-11.stl");
  });

  it("ignores blank paths", () => {
    expect(pushRecent([], "   ", 1)).toEqual([]);
  });
});
