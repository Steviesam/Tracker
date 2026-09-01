import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readCreators } from "@/lib/directory/import";

/**
 * Builds a workbook in memory so the reader is exercised through the real xlsx path,
 * hyperlinks and all, rather than against a hand-made array of rows.
 */
async function workbook(sheets: Record<string, Array<Array<string | number | null>>>) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("readCreators", () => {
  it("reads several stacked tables in one tab, each with its own columns", async () => {
    // Shaped like a real influencer sheet: a block, blank rows, then another block with a
    // different layout. Reading only the first header would drop everything below row 4.
    const file = await workbook({
      South: [
        ["STATE", "CITY", "NAME", "FOLLOWERS", "INSTA", "NICHE"],
        ["WEST BENGAL", "Kolkata", "Anoushka", "13K", "iam_anoushka", "Lifestyle"],
        [],
        [],
        ["CITY", "NAME", "FOLLOWERS", "INSTA", "LANGAUGE", "AVG VIEW"],
        ["CHENNAI", "chennai vibes", "309k", "@chennaivibes", "Tamil & Eng", "31400"],
        ["MADURAI", "Madhuri chithral", "121K", "madurai_chithra", "Tamil", "132000"],
        [],
        ["CITY", "NAME", "FOLLOWERS", "INSTA", "SHOOT"],
        ["MYSURU", "aansha gowda", "27k", "aansha_gowda/", "yes"],
      ],
    });

    const { records, summary } = await readCreators(file, "influencers.xlsx");

    expect(records).toHaveLength(4);
    expect(records.map((record) => record.username).sort()).toEqual([
      "aansha_gowda",
      "chennaivibes",
      "iam_anoushka",
      "madurai_chithra",
    ]);

    expect(summary.sheets[0].blocks).toBe(3);
    expect(summary.sheets[0].accepted).toBe(4);
  });

  it("keeps states out of the city filter and cities out of the state filter", async () => {
    // The three ways a real sheet mixes the two columns up, in one file.
    const file = await workbook({
      Mixed: [
        ["STATE", "CITY", "NAME", "INSTA"],
        ["CHENNAI", "", "Misfiled city", "a_handle"],
        ["", "Kerala", "Misfiled state", "b_handle"],
        ["", "Mumbai, Maharashtra", "Both in one cell", "c_handle"],
        [],
        ["CITY", "NAME", "INSTA"],
        ["Patna", "City-only block", "d_handle"],
      ],
    });

    const { records, summary } = await readCreators(file, "mixed.xlsx");
    const by = (username: string) => records.find((record) => record.username === username)!;

    expect(by("a_handle")).toMatchObject({ state: "Tamil Nadu", city: "Chennai" });
    expect(by("b_handle")).toMatchObject({ state: "Kerala", city: null });
    expect(by("c_handle")).toMatchObject({ state: "Maharashtra", city: "Mumbai" });
    expect(by("d_handle")).toMatchObject({ state: "Bihar", city: "Patna" });

    // Only the two rows whose state the sheet never gave were filled in.
    expect(summary.statesDerived).toBe(2);

    expect(records.map((record) => record.city)).not.toContain("Kerala");
    expect(records.map((record) => record.state)).not.toContain("Chennai");
  });

  it("normalises casing across blocks so a city is one filter entry, not several", async () => {
    const file = await workbook({
      Data: [
        ["CITY", "NAME", "INSTA", "NICHE"],
        ["CHENNAI", "One", "one_handle", "food"],
        ["Chennai", "Two", "two_handle", "Food"],
        ["chennai", "Three", "three_handle", "FOOD"],
      ],
    });

    const { records } = await readCreators(file, "cities.xlsx");

    expect(new Set(records.map((record) => record.city))).toEqual(new Set(["Chennai"]));
    expect(new Set(records.flatMap((record) => record.niches))).toEqual(new Set(["Food"]));
  });

  it("splits a run-on category so each tag is its own filter option", async () => {
    const file = await workbook({
      Data: [
        ["INSTA", "NAME", "NICHE"],
        ["one_handle", "One", "Fashion/lifestyle/ugc"],
        ["two_handle", "Two", "City Page (pune)"],
      ],
    });

    const { records } = await readCreators(file, "niches.xlsx");
    const by = (username: string) => records.find((record) => record.username === username)!;

    expect(by("one_handle").niches).toEqual(["Fashion", "Lifestyle", "UGC"]);
    expect(by("two_handle").niches).toEqual(["City Page"]);
  });

  it("reads every tab, not just the first", async () => {
    const file = await workbook({
      "Finance creators": [
        ["INSTA", "NAME", "CITY"],
        ["money_guy", "Money Guy", "Mumbai"],
      ],
      "ugc creators": [
        ["INSTA", "NAME", "CITY"],
        ["ugc_person", "UGC Person", "Delhi"],
      ],
      Sheet3: [[], []],
    });

    const { records, summary } = await readCreators(file, "tabs.xlsx");

    expect(records.map((record) => record.username).sort()).toEqual(["money_guy", "ugc_person"]);
    expect(summary.sheets.map((sheet) => sheet.sheet)).toContain("Sheet3");
    expect(summary.sheets.find((sheet) => sheet.sheet === "Sheet3")?.accepted).toBe(0);
  });

  it("keeps the last row for a repeated handle and counts the merge", async () => {
    const file = await workbook({
      Data: [
        ["INSTA", "NAME", "FOLLOWERS"],
        ["repeat_me", "First", "45k"],
        ["repeat_me", "Second", "46000"],
      ],
    });

    const { records, summary } = await readCreators(file, "dupes.xlsx");

    expect(records).toHaveLength(1);
    expect(records[0].displayName).toBe("Second");
    expect(records[0].followers).toBe(46_000);
    expect(summary.duplicatesInFile).toBe(1);
  });

  it("reports which fields were found, so a missing filter is explainable", async () => {
    const file = await workbook({
      Data: [
        ["INSTA", "NAME", "FOLLOWERS"],
        ["someone", "Someone", "10k"],
      ],
    });

    const { summary } = await readCreators(file, "partial.xlsx");

    expect(summary.fieldsFound.sort()).toEqual(["displayName", "followers", "username"]);
    expect(summary.fieldsFound).not.toContain("city");
  });

  it("stores an unusable follower value as N/A and counts it", async () => {
    const file = await workbook({
      Data: [
        ["INSTA", "NAME", "FOLLOWERS"],
        ["phone_in_column", "Phone In Column", 8_778_006_926],
        ["free_text", "Free Text", "not responding"],
        ["fine", "Fine", "309k"],
      ],
    });

    const { records, summary } = await readCreators(file, "followers.xlsx");

    const byName = new Map(records.map((record) => [record.username, record.followers]));
    expect(byName.get("phone_in_column")).toBeNull();
    expect(byName.get("free_text")).toBeNull();
    expect(byName.get("fine")).toBe(309_000);
    expect(summary.unreadableFollowers).toBe(2);
  });

  it("skips rows with no readable handle rather than importing them wrongly", async () => {
    const file = await workbook({
      Data: [
        ["INSTA", "NAME"],
        ["", "No handle"],
        ["https://www.instagram.com/reel/ABC123/", "A reel, not an account"],
        ["good_handle", "Fine"],
      ],
    });

    const { records, summary } = await readCreators(file, "messy.xlsx");

    expect(records.map((record) => record.username)).toEqual(["good_handle"]);
    expect(summary.skippedNoUsername).toBe(2);
  });
});
