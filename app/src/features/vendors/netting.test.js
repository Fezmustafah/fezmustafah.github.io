import { describe, it, expect } from "vitest";
import { computeNet, vehicleLinesFromGrid, ledgerRows, AR, AP, KIND } from "./netting.js";

describe("computeNet", () => {
  it("Ocean cruise: pure vehicle rental is receivable (they owe us)", () => {
    const lines = [
      { date: "2-Sep", side: AR, kind: KIND.VEHICLE, label: "HIAECS Marina", qty: 1, rate: 200, amount: 200 },
      { date: "2-Sep", side: AR, kind: KIND.VEHICLE, label: "7-STR Marina", qty: 1, rate: 180, amount: 180 },
    ];
    const s = computeNet(lines, { currency: "AED" });
    expect(s.theyOweUs).toBe(380);
    expect(s.weOweThem).toBe(0);
    expect(s.net).toBe(380);
    expect(s.direction).toBe("receivable");
  });

  it("Haseeb: camps we buy net against vehicle usage → payable", () => {
    const lines = [
      { date: "2 Feb", side: AP, kind: KIND.CAMP, label: "MS LIBIANA", amount: 225 },
      { date: "3 Feb", side: AP, kind: KIND.CAMP, label: "AMIT KUMAR", amount: 1200 },
      { date: "6 Feb", side: AR, kind: KIND.VEHICLE, label: "2 vehicles usage", amount: 700 },
    ];
    const s = computeNet(lines);
    expect(s.weOweThem).toBe(1425);
    expect(s.theyOweUs).toBe(700);
    expect(s.net).toBe(-725); // we owe Haseeb 725
    expect(s.direction).toBe("payable");
    expect(s.absNet).toBe(725);
  });

  it("a large refund (negative AP) can flip the month to receivable", () => {
    const lines = [
      { date: "2 Feb", side: AP, kind: KIND.CAMP, label: "camp", amount: 225 },
      { date: "6 Feb", side: AR, kind: KIND.VEHICLE, label: "vehicles", amount: 700 },
      { date: "20 Feb", side: AP, kind: KIND.REFUND, label: "BENOM refund", amount: -10400 },
    ];
    const s = computeNet(lines);
    // weOweThem = 225 + (-10400) = -10175 ; net = 0 + 700 - (-10175) = 10875
    expect(s.weOweThem).toBe(-10175);
    expect(s.net).toBe(10875);
    expect(s.direction).toBe("receivable");
  });

  it("opening balance carries forward", () => {
    const s = computeNet([{ side: AR, amount: 100 }], { openingBalance: -50 });
    expect(s.net).toBe(50);
  });

  it("empty ledger is settled", () => {
    expect(computeNet([]).direction).toBe("settled");
  });
});

describe("vehicleLinesFromGrid", () => {
  const rateCard = [
    { id: "hiaMarina", label: "HIAECS Marina", rate: 200 },
    { id: "str7Marina", label: "7-STR Marina", rate: 180 },
    { id: "str7Seef", label: "7-STR Al Seef", rate: 160 },
  ];

  it("expands a day's counts into priced AR lines (6-Sep = 540)", () => {
    const grid = [{ date: "6-Sep", counts: { hiaMarina: 1, str7Marina: 1, str7Seef: 1 } }];
    const lines = vehicleLinesFromGrid(grid, rateCard);
    expect(lines).toHaveLength(3);
    expect(computeNet(lines).net).toBe(540);
    expect(lines.every((l) => l.side === AR)).toBe(true);
  });

  it("multiplies count × rate (27-Sep 4×200 + 1×180 = 980)", () => {
    const grid = [{ date: "27-Sep", counts: { hiaMarina: 4, str7Marina: 1 } }];
    expect(computeNet(vehicleLinesFromGrid(grid, rateCard)).net).toBe(980);
  });

  it("skips zero counts and unknown types", () => {
    const grid = [{ date: "x", counts: { hiaMarina: 0, ghost: 3 } }];
    expect(vehicleLinesFromGrid(grid, rateCard)).toHaveLength(0);
  });
});

describe("ledgerRows", () => {
  it("produces a running balance from our perspective", () => {
    const lines = [
      { date: "2 Feb", side: AP, amount: 225, label: "camp" },
      { date: "6 Feb", side: AR, amount: 700, label: "vehicles" },
    ];
    const rows = ledgerRows(lines, 0);
    expect(rows[0].credit).toBe(225); // AP increases what we owe
    expect(rows[0].running).toBe(-225);
    expect(rows[1].debit).toBe(700); // AR increases what they owe us
    expect(rows[1].running).toBe(475);
  });

  it("prepends an opening-balance row when non-zero", () => {
    const rows = ledgerRows([{ side: AR, amount: 100 }], -50);
    expect(rows[0].label).toBe("Opening balance");
    expect(rows[0].credit).toBe(50);
    expect(rows[rows.length - 1].running).toBe(50);
  });
});
