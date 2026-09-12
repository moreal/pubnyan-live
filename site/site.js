import { canReact } from './reaction-policy.js';

// pubnyan landing page. Plain browser JS; the exported clips under ./assets/ are the only data.
// Rive (./vendor/rive.js) and lottie-web (./vendor/lottie_svg.min.js) come from script tags.

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const STILL = './assets/still/normal.svg';
const stillFor = (clipName) => {
  const match = /^(?:expr|to)-(angry|curious|cry|shy)$/.exec(clipName);
  return match ? `./assets/still/${match[1]}.svg` : STILL;
};

/* ------------------------------------------------------------- motion pref */

// The page-wide motion switch. Starts from prefers-reduced-motion and can be toggled in the
// header; the choice is remembered per browser.
const motion = {
  reduced: false,
  listeners: new Set(),
  set(value) {
    this.reduced = value;
    document.documentElement.dataset.motion = value ? 'reduced' : 'full';
    for (const fn of this.listeners) fn(value);
  },
  onChange(fn) {
    this.listeners.add(fn);
  },
};

function setupMotionToggle() {
  let stored = null;
  try { stored = localStorage.getItem('pubnyan:motion'); } catch { /* private mode */ }
  motion.set(stored ? stored === 'reduced' : reduceMotionQuery.matches);

  const toggle = $('#motion-toggle');
  if (!toggle) return;
  const render = () => {
    toggle.setAttribute('aria-pressed', String(!motion.reduced));
    toggle.querySelector('span').textContent = motion.reduced ? 'Motion off' : 'Motion on';
  };
  render();
  motion.onChange(render);
  toggle.addEventListener('click', () => {
    motion.set(!motion.reduced);
    try { localStorage.setItem('pubnyan:motion', motion.reduced ? 'reduced' : 'full'); } catch { /* ignore */ }
  });
  reduceMotionQuery.addEventListener('change', (event) => {
    if (stored) return;
    motion.set(event.matches);
  });
}

/* ------------------------------------------------------------- manifest */

async function loadManifest() {
  const response = await fetch('./assets/svg/manifest.json');
  if (!response.ok) throw new Error(`manifest: ${response.status}`);
  return response.json();
}

/* ---------------------------------------------------------- hero (svg) */

// The hero cat is the idle loop as an animated SVG in an <img>. "Say hello" swaps the src to a
// one-shot clip and back to idle once it has played, so the hero needs no runtime at all.
const HERO_GREETINGS = [
  { clip: 'nod', duration: 0.85 },
  { clip: 'wink', duration: 0.95 },
  { clip: 'ear-twitch', duration: 0.75 },
  { clip: 'tilt', duration: 1.2 },
];

function setupHero(manifest) {
  const img = $('#hero-cat');
  const button = $('#hero-hello');
  if (!img || !button) return;
  const idle = './assets/svg/idle.svg';
  const durations = new Map(manifest.clips.map((c) => [c.name, c.duration]));
  let turn = 0;
  let timer = 0;
  let busy = false;

  const rest = () => {
    img.src = motion.reduced ? STILL : idle;
  };
  rest();
  motion.onChange(() => { if (!busy) rest(); });

  button.addEventListener('click', () => {
    if (busy) return;
    const greeting = HERO_GREETINGS[turn++ % HERO_GREETINGS.length];
    const duration = durations.get(greeting.clip) ?? greeting.duration;
    busy = true;
    img.src = `./assets/svg/${greeting.clip}.svg`;
    button.disabled = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      busy = false;
      button.disabled = false;
      rest();
    }, duration * 1000 + 120);
  });
}

/* -------------------------------------------------------- stage (rive) */

// The stage drives dist/rive/pubnyan.riv's "main" state machine. Inputs mirror motion/machine.ts:
// `expression` (enum index) and one trigger per reaction. `loading` exists on the machine but no
// transition uses it, so the page leaves it alone.
const EXPRESSIONS = [
  { name: 'normal', note: 'Listening. An ear catches a sound, a glance, a lean.' },
  { name: 'angry', note: 'Pinned ears and a restrained huff.' },
  { name: 'curious', note: 'The eyes lead an investigating tilt, then a second question.' },
  { name: 'cry', note: 'Unequal soft sobs, falling tears, an ear that drags.' },
  { name: 'shy', note: 'A lowered glance, a held tuck, a brief open-eyed peek.' },
];
const REACTIONS = [
  { input: 'react', label: 'Wink', key: '1', duration: 0.95 },
  { input: 'reactNod', label: 'Nod', key: '2', duration: 0.85 },
  { input: 'reactTilt', label: 'Tilt', key: '3', duration: 1.2 },
  { input: 'reactEarTwitch', label: 'Ears', key: '4', duration: 0.75 },
  { input: 'reactRingWobble', label: 'Ring', key: '5', duration: 1.8 },
  { input: 'reactCelebrate', label: 'Celebrate', key: '6', duration: 1.5 },
];

function setupStage() {
  const stage = $('#stage');
  if (!stage) return;
  const canvas = $('#stage-canvas');
  const poster = $('#stage-poster');
  const status = $('#stage-status');
  const note = $('#stage-note');
  const expressionRow = $('#stage-expressions');
  const reactionRow = $('#stage-reactions');

  const buttons = { expression: new Map(), reaction: new Map() };
  for (const expression of EXPRESSIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.expression = expression.name;
    button.textContent = expression.name;
    button.setAttribute('aria-pressed', String(expression.name === 'normal'));
    expressionRow.append(button);
    buttons.expression.set(expression.name, button);
  }
  for (const reaction of REACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip chip--action';
    button.dataset.reaction = reaction.input;
    button.innerHTML = `<span>${reaction.label}</span><kbd aria-hidden="true">${reaction.key}</kbd>`;
    button.setAttribute('aria-label', `${reaction.label} (key ${reaction.key})`);
    reactionRow.append(button);
    buttons.reaction.set(reaction.input, button);
  }

  const setDisabled = (disabled) => {
    for (const button of [...buttons.expression.values(), ...buttons.reaction.values()]) {
      button.disabled = disabled;
    }
  };
  setDisabled(true);

  if (!window.rive) {
    status.textContent = 'The Rive runtime did not load, so the stage shows the resting pose.';
    stage.classList.add('is-fallback');
    return;
  }

  let inputs = null;
  let expression = 'normal';
  const input = (name) => inputs?.find((i) => i.name === name) ?? null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function setExpression(name) {
    expression = name;
    for (const [trigger, button] of buttons.reaction) {
      button.disabled = !inputs || !canReact(name, trigger);
      button.title = button.disabled ? `Unavailable while ${name}` : '';
      if (button.disabled) button.classList.remove('is-firing');
    }
    const target = input('expression');
    if (target) target.value = EXPRESSIONS.findIndex((e) => e.name === name);
    for (const [key, button] of buttons.expression) {
      button.setAttribute('aria-pressed', String(key === name));
    }
    note.textContent = EXPRESSIONS.find((e) => e.name === name)?.note ?? '';
    stage.dataset.expression = name;
  }

  function fire(name) {
    const target = input(name);
    if (!target || !canReact(expression, name)) return false;
    target.fire();
    const button = buttons.reaction.get(name);
    if (!button) return true;
    button.classList.remove('is-firing');
    void button.offsetWidth; // restart the flash when the same button is hit twice
    button.classList.add('is-firing');
    return true;
  }

  window.rive.RuntimeLoader.setWasmUrl('./vendor/rive.wasm');
  const instance = new window.rive.Rive({
    canvas,
    src: './assets/rive/pubnyan.riv',
    stateMachines: 'main',
    autoplay: false,
    layout: new window.rive.Layout({ fit: window.rive.Fit.Contain, alignment: window.rive.Alignment.Center }),
    onLoad: () => {
      instance.resizeDrawingSurfaceToCanvas(dpr);
      inputs = instance.stateMachineInputs('main') ?? [];
      stage.classList.add('is-live');
      poster.hidden = true;
      setDisabled(false);
      setExpression('normal');
      syncPlayback();
    },
    onLoadError: () => {
      status.textContent = 'pubnyan.riv could not be loaded, so the stage shows the resting pose.';
      stage.classList.add('is-fallback');
    },
  });

  // Full motion: the machine runs while the stage is on screen. Reduced motion: it runs only
  // for the length of the reaction or expression change just requested, then pauses.
  let pauseTimer = 0;
  let onScreen = true;
  function syncPlayback() {
    if (!inputs) return;
    clearTimeout(pauseTimer);
    if (motion.reduced) {
      instance.pause();
      status.textContent = 'Motion is off: each button plays one performance, then pubnyan rests.';
    } else if (onScreen) {
      instance.play();
      status.textContent = 'Live from pubnyan.riv, state machine "main".';
    } else {
      instance.pause();
    }
  }
  function playFor(seconds) {
    if (!inputs || !motion.reduced) return;
    instance.play();
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => instance.pause(), seconds * 1000 + 150);
  }
  motion.onChange(syncPlayback);

  expressionRow.addEventListener('click', (event) => {
    const button = event.target.closest('[data-expression]');
    if (!button) return;
    setExpression(button.dataset.expression);
    playFor(0.6);
  });
  reactionRow.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reaction]');
    if (!button) return;
    const reaction = REACTIONS.find((r) => r.input === button.dataset.reaction);
    if (fire(reaction.input)) playFor(reaction.duration);
  });

  // Clicking the cat is the fastest way to share a secret.
  canvas.addEventListener('click', () => {
    if (!inputs) return;
    if (fire('react')) playFor(0.95);
  });

  // Number keys fire reactions while the stage is on screen.
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || !inputs) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return;
    const reaction = REACTIONS.find((r) => r.key === event.key);
    if (!reaction) return;
    const rect = stage.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    if (fire(reaction.input)) playFor(reaction.duration);
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => instance.resizeDrawingSurfaceToCanvas(dpr), 120);
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.05 });
    observer.observe(stage);
  }
}

/* -------------------------------------------------------- gallery (svg) */

// Every exported clip, one live at a time: the specimen list on the left, a shared preview on
// the right. Specimens show a resting pose; the selected one plays as an animated SVG.
const CLIP_NOTES = {
  spinner: 'The starorbit rig: the star breathes and turns, the ring stays put.',
  idle: 'Six seconds of listening. A sound, a glance, a whole-body lean, a blink.',
  'head-turn': 'Pupils first, then the head, then the torso commits.',
  wink: 'A shared secret with a held lean and a late ear flourish.',
  nod: 'A prepared lift, a decisive closed-eye dip, a soft recovery.',
  tilt: 'Eyes lead an investigating tilt. A pause to think.',
  'ear-twitch': 'One ear reacts before the other settles.',
  'tail-flick': 'Deprecated alias of the ring wobble, kept for existing consumers.',
  'ring-wobble': 'Orbital balancing: the torso counterleans, the ring settles last.',
  celebrate: 'A small compression, a buoyant rise, curved happy eyes at the apex.',
  'expr-angry': 'Pinned ears and a restrained huff.',
  'expr-curious': 'An investigating tilt, then a second smaller question.',
  'expr-cry': 'Unequal soft sobs and falling tears.',
  'expr-shy': 'A lowered glance, a held tuck, a brief peek.',
};

function setupGallery(manifest) {
  const list = $('#gallery-list');
  const preview = $('#gallery-preview');
  const title = $('#gallery-title');
  const meta = $('#gallery-meta');
  const note = $('#gallery-note');
  const replay = $('#gallery-replay');
  if (!list || !preview) return;

  const clips = manifest.clips.filter((clip) => !clip.name.startsWith('fixture-'));
  const groups = [
    { title: 'Ambient loops', test: (c) => c.loop },
    { title: 'One-shot reactions', test: (c) => !c.loop && !/^(to|from)-/.test(c.name) },
    { title: 'Expression transitions', test: (c) => /^(to|from)-/.test(c.name) },
  ];

  const items = new Map();
  for (const group of groups) {
    const members = clips.filter(group.test);
    if (members.length === 0) continue;
    const heading = document.createElement('li');
    heading.className = 'specimen-group';
    heading.setAttribute('role', 'presentation');
    heading.innerHTML = `<span>${group.title}</span><span>${members.length}</span>`;
    list.append(heading);
    for (const clip of members) {
      const item = document.createElement('li');
      item.setAttribute('role', 'presentation');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'specimen';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.dataset.clip = clip.name;
      button.innerHTML = `
        <img src="${stillFor(clip.name)}" alt="" width="406" height="351" loading="lazy" decoding="async">
        <span class="specimen__name">${clip.name}</span>
        <span class="specimen__meta">${clip.duration}s${clip.loop ? ' loop' : ''}</span>`;
      if (clip.rig !== 'pubnyan') button.querySelector('img').src = './assets/still/normal.svg';
      item.append(button);
      list.append(item);
      items.set(clip.name, { clip, button });
    }
  }

  let current = null;
  function show(name, { restart = true } = {}) {
    const entry = items.get(name);
    if (!entry) return;
    current = entry.clip;
    for (const [key, { button }] of items) {
      button.setAttribute('aria-selected', String(key === name));
      button.tabIndex = key === name ? 0 : -1;
    }
    title.textContent = current.name;
    meta.textContent = `${current.duration}s · ${current.fps} fps · ${current.loop ? 'loop' : 'once'} · rig ${current.rig}`;
    note.textContent = CLIP_NOTES[current.name] ?? (
      /^to-/.test(current.name) ? `Blend from the resting face into ${current.name.slice(3)}.`
        : /^from-/.test(current.name) ? `Release ${current.name.slice(5)} back into the resting face.` : ''
    );
    replay.hidden = current.loop && !motion.reduced;
    preview.alt = `${current.name} clip`;
    preview.dataset.rig = current.rig;
    if (motion.reduced && !restart) {
      preview.src = stillFor(current.name);
    } else {
      preview.src = '';
      preview.src = `./assets/svg/${current.file}`;
    }
  }

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-clip]');
    if (button) show(button.dataset.clip, { restart: !motion.reduced });
  });
  list.addEventListener('keydown', (event) => {
    const order = Array.from(items.keys());
    const index = order.indexOf(current?.name);
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta || index < 0) return;
    event.preventDefault();
    const next = order[(index + delta + order.length) % order.length];
    items.get(next).button.focus();
    show(next, { restart: !motion.reduced });
  });
  replay.addEventListener('click', () => { if (current) show(current.name, { restart: true }); });
  motion.onChange(() => { if (current) show(current.name, { restart: false }); });

  show('idle', { restart: !motion.reduced });
}

/* ------------------------------------------------------- formats (tabs) */

// The same clip in every target. Each tab mounts lazily so only one runtime is busy.
const FORMAT_CLIP = 'wink';
const FORMATS = {
  svg: {
    mount(host) {
      const img = document.createElement('img');
      img.src = motion.reduced ? STILL : `./assets/svg/${FORMAT_CLIP}.svg`;
      img.alt = `${FORMAT_CLIP} as animated SVG`;
      img.className = 'format-media';
      host.append(img);
      return () => img.remove();
    },
  },
  lottie: {
    mount(host) {
      const box = document.createElement('div');
      box.className = 'format-media';
      host.append(box);
      if (!window.lottie) {
        box.textContent = 'lottie-web did not load.';
        return () => box.remove();
      }
      const anim = window.lottie.loadAnimation({
        container: box,
        renderer: 'svg',
        loop: true,
        autoplay: !motion.reduced,
        path: `./assets/lottie/${FORMAT_CLIP}.json`,
      });
      return () => { anim.destroy(); box.remove(); };
    },
  },
  rive: {
    mount(host) {
      const canvas = document.createElement('canvas');
      canvas.className = 'format-media';
      canvas.width = 406 * 2;
      canvas.height = 351 * 2;
      host.append(canvas);
      if (!window.rive) {
        host.append('The Rive runtime did not load.');
        return () => canvas.remove();
      }
      const instance = new window.rive.Rive({
        canvas,
        src: `./assets/rive/${FORMAT_CLIP}.riv`,
        autoplay: !motion.reduced,
        layout: new window.rive.Layout({ fit: window.rive.Fit.Contain }),
      });
      return () => { instance.cleanup(); canvas.remove(); };
    },
  },
  video: {
    mount(host) {
      const video = document.createElement('video');
      video.className = 'format-media';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = !motion.reduced;
      video.controls = true;
      video.poster = STILL;
      video.src = `./assets/video/${FORMAT_CLIP}.mp4`;
      host.append(video);
      return () => { video.pause(); video.remove(); };
    },
  },
};

function setupFormats() {
  const tabs = $$('[data-format-tab]');
  const host = $('#format-stage');
  const frame = $('#format-frame');
  const sizeToggle = $('#format-size');
  const snippets = $$('[data-format-snippet]');
  if (!host || tabs.length === 0) return;
  let unmount = () => {};
  let currentName = 'svg';

  function select(name) {
    currentName = name;
    unmount();
    host.replaceChildren();
    unmount = FORMATS[name].mount(host);
    for (const tab of tabs) {
      const active = tab.dataset.formatTab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const snippet of snippets) snippet.hidden = snippet.dataset.formatSnippet !== name;
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab.dataset.formatTab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : -1;
      if (next < 0 && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      select(target.dataset.formatTab);
    });
  }
  sizeToggle?.addEventListener('click', () => {
    const avatar = frame.dataset.size !== 'avatar';
    frame.dataset.size = avatar ? 'avatar' : 'full';
    sizeToggle.setAttribute('aria-pressed', String(avatar));
    sizeToggle.querySelector('span').textContent = avatar ? 'Presentation size' : 'Try at avatar size';
  });
  motion.onChange(() => select(currentName));
  select('svg');
}

/* ------------------------------------------------------------ footer */

function setupAttribution() {
  const button = $('#copy-attribution');
  const text = $('#attribution-text');
  if (!button || !text || !navigator.clipboard) return;
  const label = button.textContent;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text.textContent.trim());
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => { button.textContent = label; }, 1600);
  });
}

/* ------------------------------------------------------------ boot */

setupMotionToggle();
setupStage();
setupFormats();
setupAttribution();
loadManifest()
  .then((manifest) => {
    setupHero(manifest);
    setupGallery(manifest);
  })
  .catch((error) => {
    console.error(error);
    const list = $('#gallery-list');
    if (list) list.textContent = 'The clip manifest could not be loaded.';
    setupHero({ clips: [] });
  });
