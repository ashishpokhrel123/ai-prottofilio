import { InvalidInputError } from "../../core/errors/domain.errors";

/**
 * A tiny recursive-descent arithmetic evaluator.
 *
 * The previous implementation ran user input through `Function()`. The regex
 * guard in front of it made exploitation awkward but not impossible, and
 * "hard to exploit" is not a security boundary — any path from a chat message
 * to the JS engine is remote code execution waiting for a regex bug.
 *
 * Grammar:
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/" | "%") factor)*
 *   factor     := ("+" | "-") factor | power
 *   power      := primary ("^" factor)?
 *   primary    := number | "(" expression ")"
 */

const MAX_EXPRESSION_LENGTH = 200;

export function evaluateExpression(input: string): number {
  const expression = input.trim();

  if (!expression) throw new InvalidInputError("Empty expression.");
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new InvalidInputError(
      `Expression exceeds ${MAX_EXPRESSION_LENGTH} characters.`,
    );
  }

  const parser = new ExpressionParser(expression);
  const value = parser.parse();

  if (!Number.isFinite(value)) {
    throw new InvalidInputError(
      "Expression did not evaluate to a finite number.",
    );
  }
  return value;
}

class ExpressionParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): number {
    const value = this.expression();
    this.skipWhitespace();

    if (this.position < this.source.length) {
      throw new InvalidInputError(
        `Unexpected character "${this.source[this.position]}" at position ${this.position}.`,
      );
    }
    return value;
  }

  private expression(): number {
    let value = this.term();

    for (;;) {
      this.skipWhitespace();
      const op = this.peek();

      if (op === "+") {
        this.position++;
        value += this.term();
      } else if (op === "-") {
        this.position++;
        value -= this.term();
      } else {
        return value;
      }
    }
  }

  private term(): number {
    let value = this.factor();

    for (;;) {
      this.skipWhitespace();
      const op = this.peek();

      if (op === "*") {
        this.position++;
        value *= this.factor();
      } else if (op === "/") {
        this.position++;
        const divisor = this.factor();
        if (divisor === 0) throw new InvalidInputError("Division by zero.");
        value /= divisor;
      } else if (op === "%") {
        this.position++;
        const divisor = this.factor();
        if (divisor === 0) throw new InvalidInputError("Modulo by zero.");
        value %= divisor;
      } else {
        return value;
      }
    }
  }

  private factor(): number {
    this.skipWhitespace();
    const char = this.peek();

    if (char === "-") {
      this.position++;
      return -this.factor();
    }
    if (char === "+") {
      this.position++;
      return this.factor();
    }
    return this.power();
  }

  private power(): number {
    const base = this.primary();
    this.skipWhitespace();

    if (this.peek() === "^") {
      this.position++;
      // Right-associative: 2^3^2 is 2^(3^2).
      return Math.pow(base, this.factor());
    }
    return base;
  }

  private primary(): number {
    this.skipWhitespace();

    if (this.peek() === "(") {
      this.position++;
      const value = this.expression();
      this.skipWhitespace();

      if (this.peek() !== ")") {
        throw new InvalidInputError("Unbalanced parentheses.");
      }
      this.position++;
      return value;
    }

    return this.number();
  }

  private number(): number {
    this.skipWhitespace();
    const start = this.position;

    while (
      this.position < this.source.length &&
      /[\d.]/.test(this.source[this.position])
    ) {
      this.position++;
    }

    const literal = this.source.slice(start, this.position);
    if (!literal || !/^\d*\.?\d+$/.test(literal)) {
      throw new InvalidInputError(
        `Expected a number at position ${start}, found "${literal || this.peek() || "end of input"}".`,
      );
    }

    return Number.parseFloat(literal);
  }

  private peek(): string | undefined {
    return this.source[this.position];
  }

  private skipWhitespace(): void {
    while (
      this.position < this.source.length &&
      /\s/.test(this.source[this.position])
    ) {
      this.position++;
    }
  }
}
