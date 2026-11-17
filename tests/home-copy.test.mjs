import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("homepage keeps the approved narrative and product introduction in order", () => {
  const copy = [
    'MACKLEY means<br /><span>REVOLUTION,</span>',
    'from who you are<br /><span>inside,</span>',
    'to what you do<br /><span>outside.</span>',
    '<h2 class="mk-belief">Close the gap.</h2>',
    '<p class="mk-product-intro">Starting with the best tool for the most important hygienic habit:</p>',
    '<h1 id="product-name" class="mk-product-title">Pure Copper Neti Pot</h1>'
  ];
  let previous = -1;
  for (const text of copy) {
    const position = home.indexOf(text);
    assert.ok(position > previous, `Missing or out-of-order copy: ${text}`);
    previous = position;
  }
  assert.equal((home.match(/class="mk-scene"/g) || []).length, 3);
  assert.match(home, /<p class="mk-price">\$42<\/p>/);
});
