import { InvalidInputError } from "../../core/errors/domain.errors";
import { evaluateExpression } from "./expression.evaluator";

describe("evaluateExpression", () => {
  describe("arithmetic", () => {
    it.each([
      ["1 + 1", 2],
      ["2025 - 2019", 6],
      ["3 * 4", 12],
      ["10 / 4", 2.5],
      ["10 % 3", 1],
      ["2 ^ 10", 1024],
      ["-5 + 3", -2],
      ["+7", 7],
      ["2 + 3 * 4", 14],
      ["(2 + 3) * 4", 20],
      ["((1 + 2) * (3 + 4))", 21],
      ["1.5 * 2", 3],
      ["  8   /   2  ", 4],
    ])("evaluates %s to %d", (input, expected) => {
      expect(evaluateExpression(input)).toBe(expected);
    });

    it("treats exponentiation as right-associative", () => {
      expect(evaluateExpression("2 ^ 3 ^ 2")).toBe(512);
    });

    it("binds unary minus looser than exponentiation, as maths does", () => {
      // -2 ^ 2 is -(2^2), matching Python and standard notation.
      expect(evaluateExpression("-2 ^ 2")).toBe(-4);
      expect(evaluateExpression("(-2) ^ 2")).toBe(4);
    });
  });

  describe("rejects invalid input", () => {
    it.each([
      ["", "empty"],
      ["1 / 0", "division by zero"],
      ["10 % 0", "modulo by zero"],
      ["(1 + 2", "unbalanced parentheses"],
      ["1 +", "trailing operator"],
      ["abc", "letters"],
      ["1 2", "juxtaposed numbers"],
    ])("rejects %j (%s)", (input) => {
      expect(() => evaluateExpression(input)).toThrow(InvalidInputError);
    });

    it("rejects an over-long expression", () => {
      expect(() => evaluateExpression("1+".repeat(200) + "1")).toThrow(
        InvalidInputError,
      );
    });
  });

  /**
   * The regression this parser exists for: the previous implementation passed
   * user input to `Function()` behind a regex allow-list. These payloads must
   * be rejected as malformed arithmetic, never executed.
   */
  describe("code injection", () => {
    it.each([
      "process.exit(1)",
      "require('fs')",
      "globalThis",
      "constructor.constructor('return 1')()",
      "this.constructor",
      "[].constructor",
      "1;process.exit(1)",
      "(()=>1)()",
      "0x41",
      "1e10000",
    ])("refuses to evaluate %j", (payload) => {
      expect(() => evaluateExpression(payload)).toThrow(InvalidInputError);
    });
  });
});
