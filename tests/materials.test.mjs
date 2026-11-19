import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("scene video and poster share grayscale without desaturating products", () => {
  assert.match(css, /\.mk-scene__media video,\.mk-scene__media img\{[^}]*filter:grayscale\(1\)/);
  assert.doesNotMatch(css, /\.mk-gallery[^{}]*\{[^}]*grayscale/);
});

test("navigation removes glow and provides opaque accessibility fallbacks", () => {
  const header = css.match(/\.mk-header\{([^}]+)\}/)[1];
  assert.match(header, /background:#fff/);
  assert.match(css, /\.mk-header\{background:rgba\(248,248,250,\.34\);[^}]*backdrop-filter:blur\(7px\) saturate\(125%\) contrast\(58%\) brightness\(145%\)/);
  assert.doesNotMatch(header, /inset 0/);
  assert.match(css, /\.mk-header :is\(\.mk-logo,\.mk-button--secondary\)\{text-shadow:none;color:var\(--mk-ink\)/);
  assert.match(css, /\.mk-header \.mk-brand\{color:var\(--mk-red\)/);
  assert.match(css, /@media\(prefers-reduced-transparency:reduce\),\(prefers-contrast:more\)\{\.mk-header\{background:#fff;[^}]*backdrop-filter:none/);
});

test("navigation ink retains 4.5:1 contrast over the darkest possible header background", () => {
  const luminance = (rgb) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const liftedBlack = 255 * ((1 - 0.58) / 2) * 1.45;
  const background = luminance([248, 248, 250].map(v => v * 0.34 + liftedBlack * 0.66));
  const text = luminance([29, 29, 31]);
  assert.ok((background + 0.05) / (text + 0.05) >= 4.5);
});
