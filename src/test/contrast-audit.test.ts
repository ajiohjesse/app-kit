import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8"
);

type Tokens = Record<string, string>;

function extractBlock(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) {
    throw new Error(`token block ${marker} not found`);
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function parseTokens(source: string): Tokens {
  const tokens: Tokens = {};
  for (const match of source.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function resolve(name: string, tokens: Tokens): string {
  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`token --${name} is missing`);
  }
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) return resolve(ref[1], tokens);
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`token --${name} (${value}) is not a supported hex color`);
  }
  return value;
}

function linearize(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

type Pair = {
  fg: string;
  bg: string;
  min: number;
};

const cases: Pair[] = [
  { fg: "foreground", bg: "background", min: 4.5 },
  { fg: "foreground", bg: "card", min: 4.5 },
  { fg: "card-foreground", bg: "card", min: 4.5 },
  { fg: "text-muted", bg: "background", min: 4.5 },
  { fg: "text-muted", bg: "surface-2", min: 4.5 },
  { fg: "text-subtle", bg: "background", min: 4.5 },
  { fg: "text-subtle", bg: "surface-2", min: 4.5 },
  { fg: "text-subtle", bg: "sidebar", min: 4.5 },
  { fg: "text-accent", bg: "background", min: 4.5 },
  { fg: "text-accent", bg: "surface-2", min: 4.5 },
  { fg: "text-accent", bg: "sidebar", min: 4.5 },
  { fg: "accent-hover", bg: "background", min: 4.5 },
  { fg: "muted-foreground", bg: "card", min: 4.5 },
  { fg: "secondary-foreground", bg: "secondary", min: 4.5 },
  { fg: "primary-foreground", bg: "primary", min: 4.5 },
  { fg: "popover-foreground", bg: "popover", min: 4.5 },
  { fg: "line-strong", bg: "background", min: 3 },
  { fg: "line-strong", bg: "surface", min: 3 },
  { fg: "line-strong", bg: "surface-2", min: 3 },
  { fg: "ring", bg: "background", min: 3 },
  { fg: "accent", bg: "background", min: 3 },
];

const aliases: [string, string][] = [
  ["text-accent", "accent"],
  ["ring", "accent"],
];

const modes = [
  { name: "light", marker: ":root {" },
  { name: "dark", marker: ".dark {" },
];

describe.each(modes)("contrast audit — $name", ({ marker }) => {
  const tokens = parseTokens(extractBlock(marker));

  it.each(aliases)("%s stays in sync with %s", (alias, source) => {
    expect(resolve(alias, tokens)).toBe(resolve(source, tokens));
  });

  it.each(cases)("$fg on $bg meets $min:1", ({ fg, bg, min }) => {
    const ratio = contrastRatio(resolve(fg, tokens), resolve(bg, tokens));
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});
