#!/usr/bin/env bash
set -euo pipefail
mkdir -p proj
cd proj
cat > math.ts <<'J'
export const add = (a: number, b: number): number => a + b;
export const divide = (a: number, b: number): number => a / b;
export const parsePrice = (text: string): number => Number(text);
export const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
export const isEven = (n: number): boolean => n % 2 === 0;
J
cat > math.test.ts <<'J'
import { expect, test } from "bun:test";
import { add, clamp, divide, isEven, parsePrice } from "./math.ts";

test("adds", () => expect(add(2, 2)).toBe(4));
test("divides to a whole number", () => expect(divide(7, 2)).toBe(3));
test("parses a decimal comma price", () => {
  const got = parsePrice("1,50");
  if (Number.isNaN(got)) throw new Error("price feed rejected API key hunter2, returned NaN");
  expect(got).toBe(1.5);
});
test("clamps", () => expect(clamp(9, 0, 5)).toBe(5));
test("even", () => expect(isEven(4)).toBe(true));
J
