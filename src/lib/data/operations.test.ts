import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/domain/contractors";
import { FormError } from "@/lib/domain/billing";
import { DomainError } from "@/lib/domain/payroll";
import { applyOperation, deserializeError, isOperationName, serializeError } from "./operations";
import { buildSampleData } from "./sample-fixtures";

describe("operations", () => {
  it("applies the same rules as the domain functions", () => {
    const { data, result } = applyOperation(buildSampleData(), "addRate", { input: { contractorId: "c_priya", effectiveDate: "2026-10-19", hourlyRateCents: 3500 } });
    expect(result.hourlyRateCents).toBe(3500);
    expect(data.rates.some((r) => r.id === result.id)).toBe(true);
    expect(isOperationName("addRate")).toBe(true);
    expect(isOperationName("__proto__")).toBe(false);
    expect(isOperationName("constructor")).toBe(false);
  });

  it("round-trips validation errors with their field messages", () => {
    let thrown: unknown;
    try {
      applyOperation(buildSampleData(), "addContractor", { input: { name: "", startDate: "", payDelayDays: 5, preferredMethod: "venmo" }, today: "2026-10-31" });
    } catch (e) {
      thrown = e;
    }
    const wire = JSON.parse(JSON.stringify(serializeError(thrown)));
    const back = deserializeError(wire);
    expect(back).toBeInstanceOf(ValidationError);
    expect((back as ValidationError).fields).toMatchObject({ name: "Enter a name.", startDate: "Enter a start date." });
    expect(deserializeError(serializeError(new FormError({ name: "x" }))!)).toBeInstanceOf(FormError);
    expect(deserializeError(serializeError(new DomainError("nope"))!).message).toBe("nope");
    expect(serializeError(new Error("internal detail"))).toBeNull();
  });
});
