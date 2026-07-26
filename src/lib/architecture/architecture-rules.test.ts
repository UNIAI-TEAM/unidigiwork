/**
 * Blueprint §25 — architecture scanner. Static checks against the repo.
 * Runs synchronously via node:fs so tests are deterministic in CI.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(process.cwd(), f);

function isRouteOrComponent(f: string): boolean {
  const r = rel(f);
  return (
    r.startsWith("src/routes/") ||
    r.startsWith("src/components/") ||
    r.startsWith("src/hooks/")
  );
}

describe("architecture rules", () => {
  it("no client-reachable file imports the service-role client at module scope", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (f.endsWith("client.server.ts")) continue;
      const src = read(f);
      // Match top-level static imports only.
      const staticImport = /^\s*import[^\n]*['"]@\/integrations\/supabase\/client\.server['"]/m;
      if (isRouteOrComponent(f) && staticImport.test(src)) violations.push(rel(f));
    }
    expect(violations).toEqual([]);
  });

  it("route components do not fabricate LiveKit tokens", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isRouteOrComponent(f)) continue;
      const src = read(f);
      if (/livekit.*token|createToken\s*\(/i.test(src)) {
        // Allow comments referencing the rule.
        if (!/\/\/.*never.*livekit/i.test(src)) violations.push(rel(f));
      }
    }
    expect(violations).toEqual([]);
  });

  it("domain contracts do not import Supabase generated types", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!f.includes("/src/contracts/")) continue;
      const src = read(f);
      if (/@\/integrations\/supabase\//.test(src)) violations.push(rel(f));
    }
    expect(violations).toEqual([]);
  });

  it("SDK does not import React components", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!f.includes("/src/sdk/")) continue;
      const src = read(f);
      if (/from\s+['"]react['"]|from\s+['"]@\/components\//.test(src))
        violations.push(rel(f));
    }
    expect(violations).toEqual([]);
  });

  it("no dual-write: no client-side backend provider override", () => {
    // Provider chosen by runtime env only; assert no code writes provider.
    const violations: string[] = [];
    for (const f of files) {
      const src = read(f);
      if (/setBackendProvider\s*\(/.test(src)) violations.push(rel(f));
    }
    expect(violations).toEqual([]);
  });
});