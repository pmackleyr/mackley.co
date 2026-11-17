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
  assert.match(header, /background:rgba\(255,255,255,\.94\)/);
  assert.doesNotMatch(header, /inset 0|saturate\(/);
  assert.match(css, /\.mk-header \.mk-logo,\.mk-header \.mk-button--secondary\{text-shadow:none/);
  assert.match(css, /@media\(prefers-reduced-transparency:reduce\),\(prefers-contrast:more\)\{\.mk-header\{background:#fff;[^}]*backdrop-filter:none/);
});

test("red navigation text retains 4.5:1 contrast over the darkest possible header background", () => {
  const luminance = (rgb) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = luminance([255 * 0.94, 255 * 0.94, 255 * 0.94]);
  const text = luminance([215, 5, 0]);
  assert.ok((background + 0.05) / (text + 0.05) >= 4.5);
});
