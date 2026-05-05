import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DASHBOARD_DIR = path.resolve(__dirname, "../components/Dashboard");

function findTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsxFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const ALL_HOOKS = [
  "useState",
  "useEffect",
  "useCallback",
  "useMemo",
  "useRef",
  "useReducer",
  "useContext",
  "useLayoutEffect",
  "useImperativeHandle",
  "useDebugValue",
  "useDeferredValue",
  "useTransition",
  "useId",
  "useSyncExternalStore",
  "useInsertionEffect",
];

function parseHookImport(source: string): string[] {
  const match = source.match(/import\s*\{([^}]+)\}\s*from\s*["']react["']/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.replace(/type\s+/g, "").trim())
    .filter((s) => ALL_HOOKS.includes(s));
}

function parseHookUsages(source: string): string[] {
  const used = new Set<string>();
  for (const hook of ALL_HOOKS) {
    const re = new RegExp(`\\b${hook}\\s*[<(]`, "g");
    if (re.test(source)) used.add(hook);
  }
  return [...used];
}

describe("React hooks import validation", () => {
  const files = findTsxFiles(DASHBOARD_DIR);

  it("should find at least 30 .tsx files under Dashboard", () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  for (const file of files) {
    const rel = path.relative(DASHBOARD_DIR, file);

    it(`${rel}: every used hook is imported`, () => {
      const source = fs.readFileSync(file, "utf-8");
      const imported = new Set(parseHookImport(source));
      const used = parseHookUsages(source);

      for (const hook of used) {
        expect(
          imported.has(hook),
          `"${hook}" is used but not imported from "react"`,
        ).toBe(true);
      }
    });

    it(`${rel}: every imported hook is used`, () => {
      const source = fs.readFileSync(file, "utf-8");
      const imported = parseHookImport(source);
      const used = new Set(parseHookUsages(source));

      for (const hook of imported) {
        expect(
          used.has(hook),
          `"${hook}" is imported from "react" but never used`,
        ).toBe(true);
      }
    });
  }
});
