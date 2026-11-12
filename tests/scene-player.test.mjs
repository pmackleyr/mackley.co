import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createScenePlayer, shuffledPlaylist, SCENE_CLIPS } from '../scene-player.js';

class Events {
  constructor() { this.events = new Map(); }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
  emit(name) { for (const fn of [...(this.events.get(name) || [])]) fn({ type: name }); }
}
function fixture({ height = 1000, sceneHeight = 1000, mode = 'play' } = {}) {
  let time = 0, watchdog, observer, animation;
  const videos = [], created = [];
  class Element extends Events {
    constructor(tag) { super(); this.tagName = tag; const classes = new Set(); this.classList = { add: name => classes.add(name), contains: name => classes.has(name), remove: name => classes.delete(name) }; this.attributes = {}; this.currentTime = 0; this.duration = 5; this.paused = true; this.ended = false; this.playCalls = 0; created.push(this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    load() {}
    pause() { this.paused = true; }
    play() { this.playCalls++; if (mode === 'blocked') return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); if (mode === 'broken') return Promise.reject(Object.assign(new Error('broken'), { name: 'NotSupportedError' })); if (mode !== 'loading') { this.paused = false; this.emit('playing'); } return Promise.resolve(); }
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  function scene(group, top) { const media = { children: [], append(node) { node.parent = this; this.children.push(node); } }; return { dataset: { scene: group }, media, rect: { top, bottom: top + sceneHeight, height: sceneHeight }, getBoundingClientRect() { return this.rect; }, querySelector() { return media; } }; }
  const scenes = [scene('inside', 0), scene('outside', sceneHeight)];
  const doc = new Events(); doc.hidden = false; doc.documentElement = { clientHeight: height }; doc.querySelectorAll = () => scenes; doc.createElement = tag => { const element = new Element(tag); if (tag === 'video') videos.push(element); return element; };
  const reduced = new Events(); reduced.matches = false;
  const win = new Events(); Object.assign(win, { innerHeight: height, matchMedia: () => reduced, performance: { now: () => time }, requestAnimationFrame: fn => { animation = fn; return 1; }, setInterval: fn => { watchdog = fn; return 1; }, clearInterval: () => { watchdog = null; }, IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = null; } } });
  const player = createScenePlayer({ win, doc, now: () => time, random: () => 0.4 });
  const visible = () => scenes.flatMap(s => s.media.children).find(node => node.tagName === 'video' && node.classList.contains('is-visible') && !node.removed);
  return { win, doc, reduced, scenes, videos, created, player, visible, tick(ms) { time += ms; watchdog?.(); }, flushFrame() { const fn = animation; animation = null; fn?.(); }, show(index) { scenes.forEach((s, i) => { s.rect.top = (i - index) * sceneHeight; s.rect.bottom = s.rect.top + sceneHeight; }); observer?.(); this.flushFrame(); }, finish() { const v = visible(); v.currentTime = v.duration; v.ended = true; v.emit('ended'); } };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('shuffle plays each clip once per bag and does not repeat at the boundary', () => {
  const next = shuffledPlaylist(SCENE_CLIPS.inside, () => 0.3); const clips = Array.from({ length: 90 }, () => next().src);
  for (let i = 1; i < clips.length; i++) assert.notEqual(clips[i], clips[i - 1]);
  for (let i = 0; i < clips.length; i += 3) assert.equal(new Set(clips.slice(i, i + 3)).size, 3);
});
test('native ended advances once and only the current and preloaded videos are retained', () => {
  const f = fixture(); const played = [];
  for (let i = 0; i < 18; i++) { const v = f.visible(); played.push(v.src); assert.equal(v.loop, false); assert.equal(v.muted, true); assert.equal(v.playsInline, true); assert.ok(f.scenes[0].media.children.length <= 3); f.finish(); }
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
  f.player.destroy(); assert.equal(f.scenes[0].media.children.length, 0);
});
test('an independent watchdog recovers a decoder stall even without ended or timeupdate', () => {
  const f = fixture(), first = f.visible(), source = first.src;
  f.tick(3600); assert.equal(first.playCalls, 2); // One resume attempt.
  f.tick(1600); assert.notEqual(f.visible().src, source); assert.equal(first.removed, true);
  f.player.destroy();
});
test('watchdog detects the end position when the browser misses ended', () => {
  const f = fixture(), first = f.visible(); first.currentTime = first.duration; f.tick(750); assert.notEqual(f.visible(), first); f.player.destroy();
});
test('short landscape and taller scenes activate using visible viewport coverage', () => {
  const f = fixture({ height: 390, sceneHeight: 1100 }); assert.ok(f.visible()); f.show(1); assert.ok(f.visible().src.includes('/motion/')); assert.equal(f.scenes[0].media.children.length, 0); assert.ok(f.scenes[1].media.children.length > 0); f.player.destroy();
});
test('hidden tabs unload videos, then visibility and reduced-motion changes recover cleanly', () => {
  const f = fixture(); f.doc.hidden = true; f.doc.emit('visibilitychange'); assert.equal(f.scenes[0].media.children.length, 0);
  f.doc.hidden = false; f.doc.emit('visibilitychange'); assert.ok(f.visible());
  f.reduced.matches = true; f.reduced.emit('change'); assert.equal(f.visible(), undefined); assert.equal(f.scenes[0].media.children[0].tagName, 'img');
  f.reduced.matches = false; f.reduced.emit('change'); assert.ok(f.visible()); f.player.destroy();
});
test('blocked autoplay degrades to a still poster instead of repeatedly loading clips', async () => {
  const f = fixture({ mode: 'blocked' }); await settle(); assert.equal(f.visible(), undefined); assert.equal(f.videos.length, 1); assert.equal(f.scenes[0].media.children[0].tagName, 'img'); f.tick(60000); assert.equal(f.videos.length, 1); f.player.destroy();
});
test('failed playback has a finite retry budget and releases failed media', async () => {
  const f = fixture({ mode: 'broken' }); await settle(); assert.equal(f.videos.length, 3); assert.equal(f.visible(), undefined); assert.equal(f.scenes[0].media.children.length, 1); assert.ok(f.videos.every(v => v.removed)); f.player.destroy();
});
test('a video that never starts is timed out and other clips are attempted', () => {
  const f = fixture({ mode: 'loading' }); for (let i = 0; i < 3; i++) f.tick(11000); assert.equal(f.videos.length, 3); assert.equal(f.scenes[0].media.children[0].tagName, 'img'); f.player.destroy();
});
test('preload errors do not stop the current video and stale events cannot revive disposed scenes', () => {
  const f = fixture(), old = f.visible(), prepared = f.scenes[0].media.children.find(v => v !== old); prepared.emit('error'); assert.equal(f.visible(), old); f.tick(750); assert.equal(f.scenes[0].media.children.length, 2);
  f.show(1); old.emit('playing'); old.emit('ended'); old.emit('error'); assert.equal(f.scenes[0].media.children.length, 0); assert.ok(f.visible()); f.player.destroy();
});
test('a failed preload cannot cause the visible clip to repeat while another valid clip exists', () => {
  const f = fixture(); let failedSource;
  const first = f.visible(); const preload = f.scenes[0].media.children.find(v => v !== first);
  failedSource = preload.src; preload.emit('error');
  f.tick(750);
  const played = [];
  for (let i = 0; i < 12; i++) { const current = f.visible(); played.push(current.src); f.finish(); }
  assert.ok(!played.includes(failedSource));
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
  f.player.destroy();
});
test('all six MP4 clips and static posters are present and MP4 metadata precedes media for fast start', () => {
  for (const clip of [...SCENE_CLIPS.inside, ...SCENE_CLIPS.outside]) { const mp4 = readFileSync(`.${clip.src}`); assert.ok(mp4.indexOf(Buffer.from('ftyp')) >= 0); assert.ok(mp4.indexOf(Buffer.from('moov')) < mp4.indexOf(Buffer.from('mdat'))); assert.ok(readFileSync(`.${clip.poster}`).length > 1000); }
  assert.equal(readdirSync('public/motion').filter(name => name.endsWith('.mp4')).length, 6);
});
