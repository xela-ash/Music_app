import { describe, expect, it } from "vitest";
import { DELIVERABLE_CATALOGUE } from "./deliverableCatalogue";
import { formatAmount, parseMajorToMinor } from "./money";

describe("minor-unit display", () => {
  it("reads 125050 with exponent 2 as 1,250.50", () => {
    expect(formatAmount(125050, 2)).toBe("1,250.50");
    expect(formatAmount(125050, 2)).not.toBe("125,000.50");
    expect(parseMajorToMinor("1,250.50", 2)).toBe(125050);
    expect(parseMajorToMinor("125,000.50", 2)).toBe(12500050);
    expect(formatAmount(125050, 0)).toBe("125,050");
  });
});

describe("deliverable catalogue", () => {
  it("lists vocal stems once", () => {
    const matches = DELIVERABLE_CATALOGUE.filter((entry) => entry.label === "Vocal Stems");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.groups).toEqual(["Stems", "Vocals"]);
  });
});
