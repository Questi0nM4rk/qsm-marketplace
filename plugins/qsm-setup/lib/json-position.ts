// Where a JSON text stops being JSON.

export interface JsonError {
  readonly line: number;
  readonly column: number;
  readonly reason: string;
}

/** Walks the text once; on the first fault it throws with `i` left at the
 * offending offset and the reason as the message. */
class Scanner {
  i = 0;
  private readonly s: string;
  constructor(s: string) {
    this.s = s;
  }

  fault(reason: string): never {
    throw new Error(this.i >= this.s.length ? "unexpected end of file" : reason);
  }

  ws(): void {
    while (this.i < this.s.length && " \t\n\r\uFEFF".includes(this.s.charAt(this.i))) {
      this.i += 1;
    }
  }

  expect(ch: string): void {
    if (this.s.charAt(this.i) !== ch) {
      this.fault(`expected ${JSON.stringify(ch)}`);
    }
    this.i += 1;
  }

  value(): void {
    this.ws();
    const c = this.s.charAt(this.i);
    if (c === "{") {
      this.list("}", () => {
        this.ws();
        this.string();
        this.ws();
        this.expect(":");
        this.value();
      });
    } else if (c === "[") {
      this.list("]", () => this.value());
    } else if (c === '"') {
      this.string();
    } else if (c === "-" || (c >= "0" && c <= "9")) {
      this.number();
    } else {
      this.literal();
    }
    this.ws();
  }

  list(close: string, item: () => void): void {
    this.i += 1;
    this.ws();
    if (this.s.charAt(this.i) === close) {
      this.i += 1;
      return;
    }
    for (;;) {
      item();
      this.ws();
      const c = this.s.charAt(this.i);
      if (c === close) {
        this.i += 1;
        return;
      }
      this.expect(",");
      this.ws();
      if (this.s.charAt(this.i) === close) {
        this.fault("trailing comma");
      }
    }
  }

  string(): void {
    this.expect('"');
    for (;;) {
      const c = this.s.charAt(this.i);
      if (c === "" || c < " ") {
        this.fault("unterminated string or control character in string");
      }
      this.i += 1;
      if (c === '"') {
        return;
      }
      if (c === "\\") {
        this.escape();
      }
    }
  }

  escape(): void {
    const c = this.s.charAt(this.i);
    if (c === "u") {
      const hex = this.s.slice(this.i + 1, this.i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        this.fault("invalid unicode escape");
      }
      this.i += 5;
      return;
    }
    if (!'"\\/bfnrt'.includes(c) || c === "") {
      this.fault("invalid escape");
    }
    this.i += 1;
  }

  number(): void {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (m === null) {
      this.fault("invalid number");
    }
    this.i += m[0].length;
  }

  literal(): void {
    for (const word of ["true", "false", "null"]) {
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length;
        return;
      }
    }
    this.fault("unexpected character");
  }

  document(): void {
    this.value();
    if (this.i < this.s.length) {
      this.fault("unexpected content after the value");
    }
  }
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

/** Null when the text is JSON; otherwise the 1-based position and a fixed
 * reason that carries none of the text. */
export function jsonErrorAt(text: string): JsonError | null {
  try {
    JSON.parse(text);
    return null;
  } catch {
    // the engine's message is dropped on purpose: it can quote the content
  }
  const scanner = new Scanner(text);
  try {
    scanner.document();
  } catch (e) {
    return { ...lineColumn(text, scanner.i), reason: (e as Error).message };
  }
  return { line: 1, column: 1, reason: "rejected by the JSON parser" };
}
