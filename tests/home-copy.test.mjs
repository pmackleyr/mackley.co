import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("homepage keeps the approved narrative and product introduction in order", () => {
  const copy = [
    'MACKLEY means REVOLUTION,',
    'from who you are inside,',
    'to what you do outside.',
    '<h2 class="mk-belief"><a href="/neti/">Close the gap <span aria-hidden="true">&rarr;</span></a></h2>',
    '<p class="mk-product-intro">Start each day like a true yogi. Introducing--the best tool for the most important habit. <em>Jala neti</em> is the very first kriya for perfect reason.</p>',
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
