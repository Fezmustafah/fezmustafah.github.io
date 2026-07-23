// Billing-period maths for the tracker statement (daily / weekly / monthly /
// custom / all). The weekly window must stay identical to the old fixed
// 7-day-from-the-anchor behaviour, or existing statements renumber.
import { describe, it, expect } from "vitest";
import {
  periodRange, shiftRange, inRange, periodTitle, periodLength, periodDue, monthEnd,
} from "../src/features/tracker/period.js";

const anchor = "2026-07-01";

describe("periodRange", () => {
  it("daily is a single day", () => {
    expect(periodRange("daily", "2026-07-14")).toEqual({ start: "2026-07-14", end: "2026-07-14" });
  });

  it("weekly is the 7-day window measured from the anchor", () => {
    expect(periodRange("weekly", "2026-07-01", { anchor })).toEqual({ start: "2026-07-01", end: "2026-07-07" });
    expect(periodRange("weekly", "2026-07-07", { anchor })).toEqual({ start: "2026-07-01", end: "2026-07-07" });
    // day 10 falls in the SECOND window
    expect(periodRange("weekly", "2026-07-10", { anchor })).toEqual({ start: "2026-07-08", end: "2026-07-14" });
  });

  it("weekly handles dates before the anchor", () => {
    expect(periodRange("weekly", "2026-06-29", { anchor })).toEqual({ start: "2026-06-24", end: "2026-06-30" });
  });

  it("monthly is the whole calendar month", () => {
    expect(periodRange("monthly", "2026-07-14")).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(periodRange("monthly", "2026-02-05")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodRange("monthly", "2028-02-05")).toEqual({ start: "2028-02-01", end: "2028-02-29" }); // leap
  });

  it("all time spans the data bounds", () => {
    expect(periodRange("all", "2026-07-14", { first: "2026-05-02", last: "2026-07-20" }))
      .toEqual({ start: "2026-05-02", end: "2026-07-20" });
  });
});

describe("shiftRange", () => {
  it("steps a day, a week and a month", () => {
    expect(shiftRange("daily", { start: "2026-07-14", end: "2026-07-14" }, -1))
      .toEqual({ start: "2026-07-13", end: "2026-07-13" });
    expect(shiftRange("weekly", { start: "2026-07-08", end: "2026-07-14" }, -1))
      .toEqual({ start: "2026-07-01", end: "2026-07-07" });
    expect(shiftRange("monthly", { start: "2026-07-01", end: "2026-07-31" }, 1))
      .toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("rolls the year over at both ends", () => {
    expect(shiftRange("monthly", { start: "2026-01-01", end: "2026-01-31" }, -1))
      .toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(shiftRange("monthly", { start: "2026-12-01", end: "2026-12-31" }, 1))
      .toEqual({ start: "2027-01-01", end: "2027-01-31" });
  });

  it("slides a custom range by its own length", () => {
    // 10 days: 01..10 -> 11..20 forward, back to 01..10 again
    const r = { start: "2026-07-11", end: "2026-07-20" };
    expect(shiftRange("custom", r, -1)).toEqual({ start: "2026-07-01", end: "2026-07-10" });
    expect(shiftRange("custom", r, 1)).toEqual({ start: "2026-07-21", end: "2026-07-30" });
  });
});

describe("helpers", () => {
  it("filters rows by range inclusively", () => {
    const r = { start: "2026-07-01", end: "2026-07-07" };
    expect(inRange("2026-07-01", r)).toBe(true);
    expect(inRange("2026-07-07", r)).toBe(true);
    expect(inRange("2026-06-30", r)).toBe(false);
    expect(inRange("2026-07-08", r)).toBe(false);
  });

  it("titles the PDF by cycle", () => {
    expect(periodTitle("daily")).toBe("DAILY STATEMENT");
    expect(periodTitle("weekly")).toBe("WEEKLY STATEMENT");
    expect(periodTitle("monthly")).toBe("MONTHLY STATEMENT");
    expect(periodTitle("custom")).toBe("STATEMENT OF ACCOUNT");
    expect(periodTitle("nonsense")).toBe("WEEKLY STATEMENT"); // safe default
  });

  it("counts length and due date", () => {
    const r = { start: "2026-07-01", end: "2026-07-07" };
    expect(periodLength(r)).toBe(7);
    expect(periodDue(r)).toBe("2026-07-08");
    expect(monthEnd(2026, 2)).toBe(28);
  });
});
