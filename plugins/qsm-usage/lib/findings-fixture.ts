// How the tests reach into a findings fixture to break one field: each step is checked, so a
// fixture that changed shape fails loud here, not as a wrong expectation later.

import { isPlainObject } from "./toon-scalar.ts";

export function objectAt(value: unknown, what: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`fixture: ${what} is not an object`);
  }
  return value;
}

export function listAt(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`fixture: ${what} is not a list`);
  }
  return value;
}

export function firstTopic(doc: Record<string, unknown>): Record<string, unknown> {
  return objectAt(listAt(doc.topics, "topics")[0], "topics[0]");
}

/** A copy of the first finding, already put back as the topic's only finding, to break. */
export function firstFinding(doc: Record<string, unknown>): Record<string, unknown> {
  const topic = firstTopic(doc);
  const finding = { ...objectAt(listAt(topic.findings, "findings")[0], "findings[0]") };
  topic.findings = [finding];
  return finding;
}
