import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCENE_CLIPS, orderedPlaylist } from "../scene-player.js";

test("revolution preserves the requested order across loops", () => {
  const next = orderedPlaylist(SCENE_CLIPS.revolution);
  const names = Array.from({ length: 8 }, () => next().src.split("/").pop());
  assert.deepEqual(names, ["american.mp4", "march.mp4", "woodstock.mp4", "wall.mp4", "american.mp4", "march.mp4", "woodstock.mp4", "wall.mp4"]);
  assert.equal(orderedPlaylist([])(), undefined);
});

test("new scene clips and reduced-motion posters are packaged for fast loading", () => {
  for (const clip of SCENE_CLIPS.revolution) {
    const mp4 = readFileSync(`.${clip.src}`);
    assert.ok(mp4.indexOf(Buffer.from("ftyp")) >= 0);
    assert.ok(mp4.indexOf(Buffer.from("moov")) < mp4.indexOf(Buffer.from("mdat")));
    assert.ok(readFileSync(`.${clip.poster}`).length > 1000);
  }
});
