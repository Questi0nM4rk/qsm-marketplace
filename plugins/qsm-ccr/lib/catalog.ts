// codex's model catalog (models_cache.json): codex owns it, qsm-ccr reads it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../../../lib/outcome.ts";
import { parseJson } from "./parse.ts";

export const DAY_MS = 86_400_000;

export interface CatalogModel {
  readonly slug: string;
  readonly visibility: string;
  readonly priority: number;
  readonly contextWindow?: number;
}

export interface Catalog {
  readonly path: string;
  /** false when the file does not parse as JSON; models is then empty */
  readonly readable: boolean;
  /** ms since the epoch; NaN when the file's fetched_at is unreadable */
  readonly fetchedAt: number;
  readonly models: readonly CatalogModel[];
}

export function catalogPath(codexHome: string): string {
  return join(codexHome, "models_cache.json");
}

function toModel(m: unknown): CatalogModel[] {
  if (!isRecord(m) || typeof m.slug !== "string") {
    return [];
  }
  return [
    {
      slug: m.slug,
      visibility: typeof m.visibility === "string" ? m.visibility : "",
      priority: typeof m.priority === "number" ? m.priority : Number.MAX_SAFE_INTEGER,
      ...(typeof m.context_window === "number" ? { contextWindow: m.context_window } : {}),
    },
  ];
}

function fetchedAtOf(value: unknown): number {
  if (typeof value === "string") {
    return Date.parse(value);
  }
  if (typeof value !== "number") {
    return Number.NaN;
  }
  // seconds or milliseconds since the epoch
  return value < 1e12 ? value * 1000 : value;
}

export function readCatalog(codexHome: string): Catalog | null {
  const path = catalogPath(codexHome);
  if (!existsSync(path)) {
    return null;
  }
  let raw: unknown;
  try {
    raw = parseJson(readFileSync(path, "utf8"));
  } catch {
    return { path, readable: false, fetchedAt: Number.NaN, models: [] };
  }
  const fields = isRecord(raw) ? raw : {};
  const models = Array.isArray(fields.models) ? fields.models.flatMap(toModel) : [];
  return {
    path,
    readable: true,
    fetchedAt: fetchedAtOf(fields.fetched_at),
    models,
  };
}

/** The visibility: list models in priority order (lowest first; the live check confirms codex's order). */
export function listedModels(models: readonly CatalogModel[]): CatalogModel[] {
  return models.filter((m) => m.visibility === "list").toSorted((a, b) => a.priority - b.priority);
}

export function defaultModel(models: readonly CatalogModel[]): CatalogModel | undefined {
  return listedModels(models)[0];
}

/** The 24-hour rule of every freshness check: no time, or one that does not parse, is old. */
export function isOlderThanOneDay(at: number | undefined, now: number): boolean {
  return at === undefined || Number.isNaN(at) || now - at > DAY_MS;
}
