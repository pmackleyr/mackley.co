// The six original scene GIFs, encoded as finite H264 clips for native playback.
export const SCENE_CLIPS = Object.freeze({
  inside: ['brain', 'heart', 'chamber'].map(name => ({ src: `/public/motion/${name}.mp4`, poster: `/public/motion/${name}.jpg`, duration: 5 })),
  outside: ['surf', 'yogi', 'astronaut'].map(name => ({ src: `/public/motion/${name}.mp4`, poster: `/public/motion/${name}.jpg`, duration: name === 'surf' ? 5 : 5.1 }))
});

export function shuffledPlaylist(items, random = Math.random) {
  let queue = [], last;
  return () => {
    if (!queue.length) {
      queue = [...items];
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      if (queue.length > 1 && queue[0].src === last) [queue[0], queue[1]] = [queue[1], queue[0]];
    }
    const clip = queue.shift();
    if (clip) last = clip.src;
    return clip;
  };
}

export function createScenePlayer({ win = window, doc = document, clips = SCENE_CLIPS, now = () => win.performance.now(), random = Math.random } = {}) {
  const scenes = [...doc.querySelectorAll('[data-scene]')];
  if (!scenes.length) return { destroy() {} };
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const playlists = new Map(scenes.map(scene => [scene, shuffledPlaylist(clips[scene.dataset.scene] || [], random)]));
  const failed = new Set();
  const listeners = [];
  let active = null, current = null, pending = null, prepared = null, poster = null, retiring = [];
  let generation = 0, degraded = false, destroyed = false, scheduled = false, lastCandidate = null;
  const listen = (target, event, fn, options) => { target.addEventListener(event, fn, options); listeners.push(() => target.removeEventListener(event, fn, options)); };
  const media = () => active?.querySelector('.mk-scene__media');
  const dispose = state => {
    if (!state) return;
    state.disposed = true;
    state.video.pause();
    state.video.removeAttribute('src');
    state.video.load();
    state.video.remove();
  };
  function clear() {
    generation++;
    [...new Set([current, pending, prepared, ...retiring.map(item => item.state)])].forEach(dispose);
    retiring = [];
    current = pending = prepared = null;
    poster?.remove(); poster = null;
  }
  function showPoster(clip = clips[active?.dataset.scene]?.[0]) {
    if (!media() || !clip) return;
    poster?.remove();
    poster = doc.createElement('img');
    poster.alt = ''; poster.src = clip.poster; poster.classList.add('is-visible');
    media().append(poster);
  }
  function degrade(clip) {
    clear(); degraded = true; showPoster(clip);
  }
  const valid = state => !destroyed && !doc.hidden && !reduced.matches && active && !state.disposed && !state.retired && state.generation === generation;
  function nextCandidate() {
    const list = clips[active?.dataset.scene] || [];
    if (!list.length || list.every(clip => failed.has(clip.src))) return null;
    // At most one complete shuffled bag is inspected, including a bag boundary.
    for (let i = 0; i < list.length * 2; i++) {
      const clip = playlists.get(active)();
      const choices = list.filter(item => !failed.has(item.src)).length;
      if (!failed.has(clip.src) && (choices < 2 || clip.src !== (current?.clip.src || lastCandidate))) { lastCandidate = clip.src; return clip; }
    }
    return null;
  }
  function fail(state, autoplayBlocked = false) {
    if (!valid(state)) return;
    if (autoplayBlocked) { degrade(state.clip); return; }
    failed.add(state.clip.src);
    if (prepared === state) { prepared = null; dispose(state); return; }
    if (pending === state) pending = null;
    if (current === state) { current = null; showPoster(state.clip); }
    dispose(state);
    startNext();
  }
  function makeState(clip) {
    const video = doc.createElement('video');
    const state = { video, clip, generation, createdAt: now(), progressAt: now(), lastTime: 0, startedAt: 0, disposed: false, recoveryAttempted: false };
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.loop = false; video.controls = false; video.preload = 'auto'; video.poster = clip.poster;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    video.addEventListener('playing', () => {
      if (!valid(state) || pending !== state) return;
      const previous = current;
      pending = null; current = state;
      state.startedAt = state.progressAt = now(); state.lastTime = Number(video.currentTime) || 0;
      video.classList.add('is-visible');
      if (previous && previous !== state) {
        previous.retired = true;
        previous.video.pause();
        previous.video.classList.remove('is-visible');
        retiring.push({ state: previous, removeAt: now() + 1200 });
        while (retiring.length > 1) dispose(retiring.shift().state);
      }
      poster?.remove(); poster = null;
      prepareNext();
    });
    video.addEventListener('ended', () => { if (valid(state) && current === state) startNext(); });
    video.addEventListener('error', () => fail(state));
    video.addEventListener('timeupdate', () => {
      if (!valid(state) || current !== state) return;
      const time = Number(video.currentTime) || 0;
      if (time > state.lastTime + 0.01) { state.lastTime = time; state.progressAt = now(); state.recoveryAttempted = false; }
    });
    media().append(video);
    video.src = clip.src;
    video.load();
    return state;
  }
  function prepareNext() {
    if (prepared || pending || degraded || !active || doc.hidden || reduced.matches) return;
    const clip = nextCandidate();
    if (clip) prepared = makeState(clip);
  }
  function play(state) {
    try {
      const promise = state.video.play();
      promise?.catch(error => fail(state, error?.name === 'NotAllowedError'));
    } catch (error) { fail(state, error?.name === 'NotAllowedError'); }
  }
  function startNext() {
    if (!active || pending || degraded || doc.hidden || reduced.matches) return;
    const clip = prepared ? prepared.clip : nextCandidate();
    if (!clip) { degrade(current?.clip); return; }
    pending = prepared || makeState(clip); prepared = null;
    pending.createdAt = now();
    play(pending);
  }
  function activate(scene) {
    if (scene === active) {
      if (!current && !pending && !degraded && !reduced.matches && !doc.hidden) startNext();
      return;
    }
    clear(); active = scene; degraded = false; failed.clear(); lastCandidate = null;
    if (!active || doc.hidden) return;
    if (reduced.matches) showPoster(); else startNext();
  }
  function chooseVisible() {
    scheduled = false;
    if (destroyed || doc.hidden) { activate(null); return; }
    const viewport = win.innerHeight || doc.documentElement.clientHeight;
    let best = null, bestScore = 0, activeScore = 0;
    for (const scene of scenes) {
      const rect = scene.getBoundingClientRect();
      const visible = Math.max(0, Math.min(viewport, rect.bottom) - Math.max(0, rect.top));
      // Normalize to the viewport when a section is taller than a short screen.
      const score = visible / Math.max(1, Math.min(viewport, rect.height));
      if (scene === active) activeScore = score;
      if (score > bestScore) { best = scene; bestScore = score; }
    }
    // Keep the current scene through a near-tie to prevent rapid source restarts.
    if (active && activeScore > 0.05 && activeScore >= bestScore - 0.04) best = active;
    activate(bestScore > 0.05 ? best : null);
  }
  function scheduleVisible() {
    if (scheduled) return;
    scheduled = true; win.requestAnimationFrame(chooseVisible);
  }
  function tick() {
    retiring = retiring.filter(item => { if (now() < item.removeAt) return true; dispose(item.state); return false; });
    if (!active || degraded || doc.hidden || reduced.matches) return;
    const time = now();
    if (pending && time - pending.createdAt > 10000) { fail(pending); return; }
    if (prepared?.video.error) fail(prepared);
    if (!current) { if (!pending) startNext(); return; }
    if (!pending && (current.video.ended || (Number.isFinite(current.video.duration) && current.video.currentTime >= current.video.duration - 0.03))) { startNext(); return; }
    const currentTime = Number(current.video.currentTime) || 0;
    if (currentTime > current.lastTime + 0.01) { current.lastTime = currentTime; current.progressAt = time; current.recoveryAttempted = false; }
    if (!pending && time - current.progressAt > 3500) {
      // A stalled decoder gets one resume attempt, then the clip is skipped.
      if (!current.recoveryAttempted) { current.recoveryAttempted = true; current.progressAt = time - 2000; play(current); }
      else { fail(current); return; }
    }
    if (!pending && time - current.startedAt > Math.max(12000, current.clip.duration * 1000 + 6000)) { fail(current); return; }
    if (!prepared && !pending) prepareNext();
  }
  const watchdog = win.setInterval(tick, 750);
  let observer;
  if (win.IntersectionObserver) { observer = new win.IntersectionObserver(scheduleVisible, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }); scenes.forEach(scene => observer.observe(scene)); }
  listen(win, 'scroll', scheduleVisible, { passive: true });
  listen(win, 'resize', scheduleVisible, { passive: true });
  listen(win, 'orientationchange', scheduleVisible, { passive: true });
  listen(win, 'pageshow', chooseVisible);
  listen(doc, 'visibilitychange', () => { activate(null); if (!doc.hidden) chooseVisible(); });
  listen(reduced, 'change', () => { const scene = active; activate(null); activate(scene); chooseVisible(); });
  const retryAfterGesture = () => { if (degraded && !reduced.matches) { const scene = active; activate(null); activate(scene); } };
  listen(doc, 'pointerdown', retryAfterGesture, { passive: true });
  listen(doc, 'keydown', retryAfterGesture);
  chooseVisible();
  return { destroy() { destroyed = true; clear(); active = null; win.clearInterval(watchdog); observer?.disconnect(); listeners.forEach(remove => remove()); } };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') createScenePlayer();
