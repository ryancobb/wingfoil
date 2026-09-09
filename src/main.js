import './style.css';
import './mobile.css';
import './arcade.css';
import { Simulation, KNOTS, clamp, rad, wrap } from './physics.js';
import { createScene } from './scene.js';
import { trimFeedback } from './trim-feedback.js';

const icons = {
  pause: '<path d="M8 5v14M16 5v14"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
  wind: '<path d="M3 8h13c5 0 5-6 1-6M3 12h17M3 16h9c5 0 5 6 1 6"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 3v7h7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8c0-4 7-4 7 0 0 3-4 2-4 6m0 3v.1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
document.querySelector('#app').innerHTML = `
  <div id="world" aria-label="3D wingfoiling ocean"></div>
  <div class="vignette"></div>
  <header>
    <a class="brand" href="./" aria-label="Drift home"><span class="brand-mark">≈</span> drift<span class="brand-period">.</span></a>
    <div class="location"><span class="live-dot"></span> FREE RIDE <span class="divider">/</span> SUNBREAK BAY</div>
    <div class="header-actions"><button id="help" class="icon-button" aria-label="How to ride">${icon('help')}</button><button id="settings" class="icon-button" aria-label="Session settings">${icon('settings')}</button><button id="pause" class="icon-button" aria-label="Pause">${icon('pause')}</button></div>
  </header>
  <section class="session-label"><div class="eyebrow">SUNBREAK BAY / 01</div><h1>Chase the swell.</h1><p>Catch wind. Lift off. Let it rip.</p></section>
  <aside class="wind-card glass"><div class="eyebrow">TRUE WIND <span class="live-dot"></span></div><div class="wind-reading"><span id="wind-value">18.0</span><span class="unit">kn</span><svg class="wind-arrow" viewBox="0 0 48 48"><path d="M24 5 37 38 24 31 11 38Z" fill="currentColor"/></svg></div><div class="card-rule"></div><div class="small-row"><span>Apparent</span><strong><span id="apparent-value">18.0</span> kn</strong></div><div class="small-row"><span>Point of sail</span><strong id="sail-value">Beam reach</strong></div><div class="wind-spark"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="eyebrow muted">LIVE CONDITIONS</div></aside>
  <div class="objective glass"><span class="objective-symbol">↗</span><div><div class="eyebrow" id="objective-title">YOUR FIRST FLIGHT</div><p id="objective-text">Build speed & lift onto the foil</p></div><span id="objective-progress">0 / 3</span></div>
  <div class="telemetry"><div class="speed"><span id="speed-value">0.0</span><span>knots</span></div><div class="status"><span class="live-dot"></span><span id="status-value">READY TO RIDE</span></div><div class="metrics"><div><span class="eyebrow">FOIL HEIGHT</span><strong><span id="height-value">0</span><small> cm</small></strong></div><div><span class="eyebrow">FLIGHT TIME</span><strong id="flight-value">0:00</strong></div><div><span class="eyebrow">DISTANCE</span><strong><span id="distance-value">0</span><small> m</small></strong></div></div></div>
  <div class="foil-monitor glass"><div class="eyebrow">FOIL HEIGHT <span id="foil-load">0 cm</span></div><div class="foil-track"><span class="foil-safe"></span><span id="foil-marker"></span></div><div class="foil-labels"><span>water</span><span>breach</span></div></div>
  <div class="view-actions"><button id="wind-toggle" class="icon-button active" aria-label="Toggle wind trails" aria-pressed="true">${icon('wind')}</button><button id="camera" class="icon-button" aria-label="Change camera">${icon('camera')}</button><button id="reset" class="icon-button" aria-label="Restart session">${icon('reset')}</button></div>
  <div id="coach" class="coach"><span class="coach-dot"></span><span id="coach-text">Sheet in gently to catch the wind.</span></div>
  <div class="controls">
    <section class="steering-control"><div class="control-heading"><span>BODY & BOARD</span><span class="key-hint">W A S D</span></div><div class="pad-area"><span class="pad-label top">NOSE DOWN</span><span class="pad-label bottom">NOSE UP</span><div id="joystick" role="application" aria-label="Drag to steer and shift body weight" tabindex="0"><div class="pad-ring"></div><span class="pad-cross horizontal"></span><span class="pad-cross vertical"></span><span class="pad-left">‹</span><span class="pad-right">›</span><div id="stick"></div></div></div><div class="control-caption">steer <span>↔</span> balance <span>↕</span></div></section>
    <div class="center-controls"><button id="pump" class="pump-button">PUMP <span>SPACE</span></button><div class="energy"><span id="energy-fill"></span></div><span class="desktop-tip">PUMP IT. FIND YOUR FLIGHT.</span></div>
    <section class="wing-control"><div class="control-heading"><span>WING TRIM</span><strong id="trim-value">38%</strong></div><div class="trim-scale"><span>← EASE OUT</span><span>SHEET IN →</span></div><div class="slider-wrap"><div id="sweet-spot" title="Efficient trim"></div><input id="trim" aria-label="Wing trim" aria-describedby="trim-feedback" type="range" min="0" max="100" step="0.1" value="38" /></div><div class="trim-feedback"><span class="sweet-dot"></span><span id="trim-feedback">Find the sweet spot</span><span class="key-hint">Q / E</span></div><button id="depower" class="depower-button" aria-pressed="false"><span id="flag-label">Hold to flag</span><span class="key-hint">SHIFT</span></button></section>
  </div>
  <footer><span>5.0 m² WING <i>·</i> <span id="foil-size-label">1800</span> cm² FOIL <i>·</i> 85 cm MAST</span><span id="mode-label">ASSISTED SIMULATION</span></footer>
  <div id="overlay" class="overlay"><section class="modal intro"><div class="eyebrow">WELCOME TO SUNBREAK BAY</div><h2>Big blue.<br>Endless possibility.</h2><p>A sun-soaked playground of wind, water, and wide-open turns. Catch the breeze and fly above the blue.</p><div class="lesson-list"><div><span>01</span><p><strong>Catch the wind</strong>Sheet in (E / right) to pull the rear hand in and load the wing. Ease out (Q / left) to reduce its angle. Too far in stalls it; too far out makes it flutter.</p></div><div><span>02</span><p><strong>Find your balance</strong>Drag the round pad to steer. Drag down to shift weight back and rise; up to lower the nose.</p></div><div><span>03</span><p><strong>Stay in flight</strong>Follow the green trim band as the apparent wind shifts. Pump for takeoff; keep the foil underwater. Flag the wing to coast with minimal pull.</p></div></div><div class="intro-note">Two thumbs to ride · Portrait or landscape</div><button id="start" class="primary-button">Let's ride ${icon('arrow')}</button></section></div>
  <dialog id="settings-dialog"><form method="dialog"><div class="modal-heading"><div><div class="eyebrow">MAKE IT YOUR SESSION</div><h2>Wind & water</h2></div><button class="icon-button" aria-label="Close settings">${icon('close')}</button></div><div class="ride-actions"><button type="button" data-action="help">How to ride</button><button type="button" data-action="camera">Change camera</button><button type="button" data-action="wind-toggle" id="menu-wind" aria-pressed="true">Wind trails: on</button><button type="button" data-action="reset">Restart session</button></div><div class="menu-mission" id="menu-mission"></div><fieldset class="touch-settings"><legend>Touch controls</legend><label class="switch-label"><span>Swap thumb controls<small>Move the steering pad to your right hand.</small></span><input id="swap-controls" type="checkbox" /></label><label class="switch-label"><span>Tap to flag the wing<small>Tap again to power up. No need to keep holding.</small></span><input id="tap-flag" type="checkbox" /></label></fieldset><label>Wind strength <output id="setting-wind-value">18 knots</output><input id="setting-wind" type="range" min="6" max="30" value="18" /></label><label>Gust intensity <output id="setting-gusts-value">20%</output><input id="setting-gusts" type="range" min="0" max="60" value="20" /></label><label>Waves <output id="setting-chop-value">Rolling swell</output><input id="setting-chop" type="range" min="0" max="200" value="60" /></label><label>Wing size<select id="setting-wing"><option value="4">4.0 m² · stronger wind</option><option value="5" selected>5.0 m² · all-round</option><option value="6">6.0 m² · lighter wind</option></select></label><label>Front foil<select id="setting-foil"><option value=".12">1200 cm² · faster, later takeoff</option><option value=".18" selected>1800 cm² · early lift</option><option value=".22">2200 cm² · light wind</option></select></label><label class="switch-label"><span>Balance assistance<small>Helps hold a safe foil height. Wing trim stays manual.</small></span><input id="setting-assist" type="checkbox" checked /></label><p class="physics-note">A simplified force-based simulation: apparent wind, wing stall, hydrofoil lift and drag, buoyancy, and foil ventilation. Equipment coefficients are tuned for play; this is not a validated training model.</p><button class="primary-button">Back to the water ${icon('arrow')}</button></form></dialog>
  <div id="pause-overlay" class="overlay hidden"><section class="modal pause-modal"><div class="eyebrow">TAKE A BREATH</div><h2>Out here, time slows.</h2><div id="session-stats"></div><button id="resume" class="primary-button">Keep riding ${icon('arrow')}</button></section></div>
  <div id="toast" role="status"></div>
`;

const $ = id => document.getElementById(id);
const sim = new Simulation();
const input = { steer: 0, balance: 0, trim: .38, depower: false };
let scene;
try { scene = createScene($('world')); }
catch (error) { $('overlay').innerHTML = '<section class="modal"><h2>WebGL is unavailable</h2><p>Open Drift in a browser with WebGL 2 and hardware acceleration enabled, then reload.</p></section>'; throw error; }
let started = false, paused = false, showWind = true, lastTime = 0, accumulator = 0, uiElapsed = 0, toastTimer;
let lesson = 0, gates = 0, gate = null, gatePrevious = null;
const keys = new Set();
const preferences = { swapped: false, tapFlag: navigator.maxTouchPoints > 0 };
try { const saved = JSON.parse(localStorage.getItem('drift-touch') || '{}');
  for (const key of Object.keys(preferences)) if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
} catch { /* Storage is optional in private or restricted browsing. */ }
function syncPreferences() {
  $('app').classList.toggle('swapped', preferences.swapped);
  $('swap-controls').checked = preferences.swapped;
  $('tap-flag').checked = preferences.tapFlag;
  $('flag-label').textContent = preferences.tapFlag ? (input.depower ? 'Power up wing' : 'Flag wing') : 'Hold to flag';
  $('depower').setAttribute('aria-label', preferences.tapFlag ? (input.depower ? 'Power up wing' : 'Flag wing') : 'Hold to flag wing');
}
for (const [id, key] of [['swap-controls', 'swapped'], ['tap-flag', 'tapFlag']]) {
  $(id).onchange = e => { const checked = e.target.checked; release(); preferences[key] = checked; syncPreferences();
    try { localStorage.setItem('drift-touch', JSON.stringify(preferences)); } catch { /* Optional preference storage. */ }
  };
}
syncPreferences();
for (const button of document.querySelectorAll('[data-action]')) button.onclick = () => {
  const action = button.dataset.action;
  if (action === 'help' || action === 'reset') $('settings-dialog').close();
  $(action).click();
};
const clockText = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2500); }
function release() { keys.clear(); input.steer = input.balance = 0; input.depower = false; $('depower').classList.remove('held'); $('depower').setAttribute('aria-pressed', 'false'); $('stick').style.transform = ''; stickPointer = null; syncPreferences(); }
function setPaused(value) {
  paused = value; release(); $('pause-overlay').classList.toggle('hidden', !value);
  $('pause').setAttribute('aria-label', value ? 'Resume' : 'Pause');
  $('session-stats').innerHTML = `<div><strong>${(sim.topSpeed * KNOTS).toFixed(1)} kn</strong><span>top speed</span></div><div><strong>${clockText(sim.longestFlight)}</strong><span>longest flight</span></div><div><strong>${Math.round(sim.distance)} m</strong><span>distance</span></div>`;
}
$('start').onclick = () => { started = true; $('overlay').classList.add('hidden'); $('start').blur(); lastTime = performance.now(); };
$('help').onclick = () => { if ($('settings-dialog').open) return; release(); $('overlay').classList.remove('hidden'); $('start').textContent = started ? 'Back to the water →' : "Let's ride →"; };
$('pause').onclick = () => { if (started) setPaused(!paused); };
$('resume').onclick = () => setPaused(false);
$('settings').onclick = () => { release(); $('settings-dialog').showModal(); };
$('settings-dialog').addEventListener('close', release);
$('wind-toggle').onclick = () => { showWind = !showWind; $('wind-toggle').classList.toggle('active', showWind); $('wind-toggle').setAttribute('aria-pressed', String(showWind)); $('menu-wind').setAttribute('aria-pressed', String(showWind)); $('menu-wind').textContent = `Wind trails: ${showWind ? 'on' : 'off'}`; };
$('camera').onclick = () => toast(`${scene.camera()} camera`);
$('reset').onclick = () => { sim.reset(); lesson = gates = 0; gate = gatePrevious = null; input.trim = .38; $('trim').value = 38; release(); sim.step(0, input); toast('Fresh water. Fresh start.'); };
$('trim').oninput = e => { input.trim = Number(e.target.value) / 100; };
$('pump').onclick = () => { if (canRide() && sim.pump()) toast('Pump — build a little momentum'); };
const flag = value => { input.depower = value; $('depower').classList.toggle('held', value); $('depower').setAttribute('aria-pressed', String(value)); syncPreferences(); };
$('depower').onpointerdown = e => { if (preferences.tapFlag || !canRide()) return; e.preventDefault(); $('depower').setPointerCapture(e.pointerId); flag(true); };
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('depower').addEventListener(type, () => { if (!preferences.tapFlag) flag(false); });
$('depower').onclick = e => { if (canRide() && (preferences.tapFlag || e.detail === 0)) flag(!input.depower); };
let stickPointer = null;
function moveStick(e) {
  const r = $('joystick').getBoundingClientRect(), limit = r.width * .32;
  let x = (e.clientX - r.left - r.width / 2) / limit, y = (e.clientY - r.top - r.height / 2) / limit;
  const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
  input.steer = x; input.balance = y; $('stick').style.transform = `translate(${x * limit}px, ${y * limit}px)`;
}
$('joystick').onpointerdown = e => { if (stickPointer !== null) return; e.preventDefault(); stickPointer = e.pointerId; $('joystick').setPointerCapture(e.pointerId); moveStick(e); };
$('joystick').onpointermove = e => { if (e.pointerId === stickPointer) moveStick(e); };
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, e => { if (e.pointerId === stickPointer) { stickPointer = null; input.steer = input.balance = 0; $('stick').style.transform = ''; } });
function canRide() { return started && !paused && $('overlay').classList.contains('hidden') && !$('settings-dialog').open; }
document.addEventListener('keydown', e => {
  if ($('settings-dialog').open) return;
  if (['INPUT', 'SELECT'].includes(e.target.tagName) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
  if (e.code === 'Escape' && started && !$('settings-dialog').open && $('overlay').classList.contains('hidden')) { setPaused(!paused); return; }
  if (!canRide()) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code); if (e.code === 'Space' && !e.repeat) sim.pump();
});
document.addEventListener('keyup', e => { keys.delete(e.code); if (e.code.startsWith('Shift')) flag(false); });
window.addEventListener('resize', release);
window.addEventListener('blur', () => { release(); if (started) setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started) setPaused(true); });
for (const name of ['wind', 'gusts', 'chop', 'wing', 'foil', 'assist']) {
  $('setting-' + name).addEventListener('input', e => {
    const value = name === 'assist' ? e.target.checked : Number(e.target.value) / (['gusts', 'chop'].includes(name) ? 100 : 1);
    if (name === 'chop') { sim.setChop(value); sim.step(0, input); }
    else sim.settings[name] = value;
    if (name === 'wind') $('setting-wind-value').value = `${value} knots`;
    if (name === 'gusts') $('setting-gusts-value').value = `${Math.round(value * 100)}%`;
    if (name === 'chop') $('setting-chop-value').value = value === 0 ? 'Flat' : value < .4 ? 'Gentle swell' : value < 1.2 ? 'Rolling swell' : 'Rough seas';
    $('mode-label').textContent = sim.settings.assist ? 'ASSISTED SIMULATION' : 'MANUAL SIMULATION';
    document.querySelector('footer > span').innerHTML = `${sim.settings.wing.toFixed(1)} m² WING <i>·</i> ${Math.round(sim.settings.foil * 10000)} cm² FOIL <i>·</i> 85 cm MAST`;
  });
}
function nextGate() {
  const heading = sim.heading + (gates % 2 ? -.38 : .38);
  gate = { x: sim.x + Math.sin(heading) * 100, z: sim.z - Math.cos(heading) * 100, heading };
  gatePrevious = null;
}
function updateMission() {
  if (lesson === 0 && sim.telemetry.speed > 2.8) { lesson = 1; toast('Speed found. Let the foil lift you.'); }
  if (lesson === 1 && sim.telemetry.height > .24) { lesson = 2; toast('You’re flying. Hold it for 10 seconds.'); }
  if (lesson === 2 && sim.currentFlight >= 10) { lesson = 3; nextGate(); toast('First flight complete. Find the orange buoys.'); }
  if (gate) {
    const dx = sim.x - gate.x, dz = sim.z - gate.z;
    const side = dx * Math.cos(gate.heading) + dz * Math.sin(gate.heading);
    const along = dx * Math.sin(gate.heading) - dz * Math.cos(gate.heading);
    if (gatePrevious && gatePrevious.along < 0 && along >= 0) {
      const crossing = gatePrevious.side + (side - gatePrevious.side) * (-gatePrevious.along / (along - gatePrevious.along));
      if (Math.abs(crossing) < 9) { gates++; toast(`Gate ${gates} cleared. Keep the flow.`); nextGate(); return; }
    }
    gatePrevious = { side, along };
    if (Math.hypot(dx, dz) > 330) { nextGate(); toast('Course repositioned ahead'); }
  }
}
function updateUI() {
  const t = sim.telemetry;
  $('speed-value').textContent = (t.speed * KNOTS).toFixed(1);
  $('wind-value').textContent = (t.wind * KNOTS).toFixed(1);
  $('apparent-value').textContent = (t.apparent * KNOTS).toFixed(1);
  const trueAngle = Math.abs(wrap(sim.heading + Math.atan2(t.wx, t.wz))) / rad;
  $('sail-value').textContent = trueAngle < 40 ? 'Into wind' : trueAngle < 70 ? 'Close reach' : trueAngle < 110 ? 'Beam reach' : trueAngle < 155 ? 'Broad reach' : 'Downwind';
  document.querySelector('.wind-arrow').style.transform = `rotate(${180 - (sim.heading + Math.atan2(t.wx, t.wz)) / rad}deg)`;
  $('height-value').textContent = Math.max(0, Math.round(t.height * 100));
  $('flight-value').textContent = clockText(sim.flightTime);
  $('distance-value').textContent = Math.round(sim.distance);
  $('status-value').textContent = input.depower ? 'WING FLAGGED' : t.status;
  document.querySelector('.status').classList.toggle('warning', /STALL|BREACH|RECOVER/.test(t.status));
  $('trim-value').textContent = `${Math.round(input.trim * 100)}%`;
  $('trim').style.setProperty('--fill', `${input.trim * 100}%`);
  const feedback = trimFeedback(t);
  // Native range thumbs have an inset at the endpoints. Match the target band
  // to that travel so the efficient trim is centered under the actual thumb.
  const thumb = parseFloat(getComputedStyle($('trim')).getPropertyValue('--thumb-size')) || 21;
  const travel = $('trim').clientWidth - thumb;
  $('sweet-spot').style.left = `${thumb / 2 + (t.trimMin + t.trimMax) / 2 * travel}px`;
  $('sweet-spot').style.width = `${(t.trimMax - t.trimMin) * travel}px`;
  $('sweet-spot').hidden = !feedback.showTarget;
  $('trim-feedback').textContent = feedback.label;
  $('trim').setAttribute('aria-valuetext', `${Math.round(input.trim * 100)} percent sheeted in. ${feedback.label}`);
  document.querySelector('.wing-control').dataset.state = t.trimState;
  document.querySelector('.sweet-dot').classList.toggle('good', feedback.good);
  $('foil-marker').style.left = `${clamp(t.height / .85 * 100, 0, 100)}%`;
  $('foil-load').textContent = `${Math.max(0, Math.round(t.height * 100))} cm`;
  $('energy-fill').style.width = `${sim.pumpEnergy * 100}%`;
  $('pump').disabled = sim.pumpEnergy < .24 || sim.pumpCooldown > 0;
  let hint = feedback.hint;
  if (t.status === 'RECOVERING') hint = 'Take a breath. Your board will settle beneath you.';
  else if (t.height > .72) hint = 'Foil near the surface. Weight forward to lower the board.';
  else if (t.status === 'FOIL STALL') hint = 'Nose too high. Weight forward to restore water flow.';
  else if (feedback.good && t.speed < 3) hint = 'Clean airflow! Hold a reach and pump to help takeoff.';
  else if (feedback.good && t.height < .22) hint = 'Speed is building. Shift a little weight back to rise.';
  $('coach-text').textContent = hint;
  $('objective-title').textContent = lesson < 3 ? 'YOUR FIRST FLIGHT' : `FREE RIDE / GATE ${gates + 1}`;
  $('objective-text').textContent = lesson === 0 ? 'Build speed & lift onto the foil' : lesson === 1 ? 'Shift weight back & find lift' : lesson === 2 ? `Hold your flight · ${Math.min(10, Math.floor(sim.currentFlight))} / 10 s` : `Pass between the orange buoys · ${Math.round(Math.hypot(gate.x - sim.x, gate.z - sim.z))} m`;
  $('objective-progress').textContent = lesson < 3 ? `${lesson} / 3` : `${gates} gates`;
  $('menu-mission').textContent = `${$('objective-title').textContent} · ${$('objective-text').textContent}`;
  if (lesson === 3 && gate && t.status === 'FOILING' && feedback.good) $('coach-text').textContent = `Next gate: ${Math.round(Math.hypot(gate.x - sim.x, gate.z - sim.z))} m · Aim between the orange buoys.`;
}
sim.step(1 / 120, input); updateUI();
function frame(now) {
  const dt = Math.min((now - (lastTime || now)) / 1000, .05); lastTime = now;
  const active = canRide();
  if (active) {
    if (stickPointer === null) {
      input.steer = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      input.balance = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
    }
    if (keys.has('KeyQ') || keys.has('KeyE')) { input.trim = clamp(input.trim + (Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))) * dt * .3, 0, 1); $('trim').value = input.trim * 100; }
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) flag(true);
    accumulator += dt;
    while (accumulator >= 1 / 120) { sim.step(1 / 120, input); updateMission(); accumulator -= 1 / 120; }
  } else accumulator = 0;
  scene.render(sim, input, active ? dt : 0, gate, showWind);
  uiElapsed += dt; if (uiElapsed > .08) { updateUI(); uiElapsed = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Explicit opt-in diagnostics for browser verification, absent in normal sessions.
if (new URLSearchParams(location.search).has('debug')) window.__drift = { sim, input, graphics: scene.inspect, getState: () => ({ started, paused, lesson, gates }) };
