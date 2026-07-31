import {settext} from "./font.js";

const ROWH = 28;
const NUMW = 64, COLGAP = 24;
const CHAPTERS = [
  {id: 1, dir: "ch1", icon: "ch1"},
  {id: 2, dir: "ch2", icon: "ch2"},
  {id: 3, dir: "ch3", icon: "ch3"},
  {id: 4, dir: "ch4", icon: "ch4"},
  {id: 5, dir: "ch5", icon: "ch5"},
  {id: "guitar", dir: "guitar", icon: "guitar"},
  {id: "piano", dir: "piano", icon: "piano"},
  {id: "more", dir: "more", icon: "more"},
];
const MINPITCH = 0.2, MAXPITCH = 3;
const CLICKSLOP = 4;
const NOTCH = 100, ROWSPERNOTCH = 1;

const tabsbox = document.querySelector(".tabs");
const list = document.querySelector(".list");
const rowsbox = document.querySelector(".rows");
const panel = document.querySelector(".panel");
const controls = document.querySelector(".controls");
const seek = document.querySelector(".seek");
const seekfill = document.querySelector(".seekfill");
const timetext = document.querySelector(".time");

const audio = new Audio();
audio.preload = "none";
if ("preservesPitch" in audio) audio.preservesPitch = false;

let tracks = [], view = [], chapter = CHAPTERS[0];
let current = 0, loaded = "";
let auto = 0, pitch = 1, tempo = 1;
let raf = 0, drag = null, dragmoved = false, seeking = false, wheelacc = 0;
let colw = 0, percol = 1;

const rows = [], names = [], tabs = [], plines = [];
let heart;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const last = () => view.length - 1;
const snap = v => Math.round(v / ROWH) * ROWH;

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

/*//////////////////////////////////////////////////////////////////////*/

const CONTROLS = [
  {label: () => (audio.paused ? "Play" : "Pause"), act: toggleplay},
  {label: () => "Stop", act: stop},
  {label: () => "Auto (" + auto + ")", act: () => {auto = auto ? 0 : 1; refreshpanel()}},
  {label: () => "Top", act: () => scrollto(0)},
  {label: () => "End", act: () => scrollto(rowsbox.offsetHeight)},
  {label: () => "Pitch -", act: () => setpitch(pitch - 0.1)},
  {label: () => "Pitch +", act: () => setpitch(pitch + 0.1)},
  {label: () => "Pitch=" + (+pitch.toFixed(1)), act: () => setpitch(1)},
  {label: () => "Tempo -", act: () => settempo(tempo - 0.1)},
  {label: () => "Tempo +", act: () => settempo(tempo + 0.1)},
  {label: () => "Tempo=" + (+tempo.toFixed(1)), act: () => settempo(1)},
];

const srcof = t => "assets/audio/" + chapter.dir + "/" + encodeURIComponent(t.f);

function play() {
  const t = view[current];
  if (!t) return;
  const src = srcof(t);
  if (loaded !== src) {
    audio.src = src;
    loaded = src;
  }
  else {
    try {audio.currentTime = 0} catch {}
  }
  applyrate();
  audio.play().catch(() => {});
  refreshpanel();
}

function toggleplay() {
  if (!audio.paused) {audio.pause(); return}
  if (view[current] && loaded === srcof(view[current]) && audio.currentTime > 0 && !audio.ended) {audio.play().catch(() => {}); return}
  play();
}

function stop() {
  audio.pause();
  try {audio.currentTime = 0} catch {}
  refreshpanel();
  drawseek();
}

function applyrate() {
  if ("preservesPitch" in audio) audio.preservesPitch = pitch === 1;
  audio.playbackRate = pitch * tempo;
}

function setpitch(p) {
  pitch = clamp(Math.round(p * 10) / 10, MINPITCH, MAXPITCH);
  applyrate();
  refreshpanel();
}

function settempo(t) {
  tempo = clamp(Math.round(t * 10) / 10, MINPITCH, MAXPITCH);
  applyrate();
  refreshpanel();
}

function placeheart() {
  heart.style.left = (Math.floor(current / percol) * colw + 4) + "px";
  heart.style.top = ((current % percol) * ROWH + 8) + "px";
}

function select(i) {
  const next = clamp(i, 0, last());
  rows[current]?.classList.remove("on");
  current = next;
  rows[current].classList.add("on");
  placeheart();
}

function pick(i) {
  select(i);
  play();
}

function scrollto(top) {
  list.scrollTop = top;
}

function revealcurrent() {
  const top = (current % percol) * ROWH;
  if (top >= list.scrollTop && top + ROWH <= list.scrollTop + list.clientHeight) return;
  scrollto(snap(top - (list.clientHeight - ROWH) / 2));
}

/*//////////////////////////////////////////////////////////////////////*/

function buildtabs() {
  for (const c of CHAPTERS) {
    const tab = document.createElement("div");
    tab.className = "tab";
    const icon = document.createElement("img");
    icon.src = "assets/images/chapters/" + c.icon + ".png";
    tab.appendChild(icon);
    tab.onclick = () => setchapter(c);
    tabsbox.appendChild(tab);
    tabs.push(tab);
  }
}

function buildlist() {
  rows.length = 0;
  names.length = 0;
  rowsbox.textContent = "";
  const frag = document.createDocumentFragment();
  view.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.i = i;
    const num = document.createElement("div");
    num.className = "num";
    const name = document.createElement("div");
    name.className = "name";
    settext(num, "#" + t.n, "fnt_main");
    settext(name, t.t, "fnt_mainbig");
    row.append(num, name);
    frag.appendChild(row);
    rows.push(row);
    names.push(name);
  });
  heart = document.createElement("img");
  heart.className = "heart";
  heart.src = "assets/images/heart.png";
  frag.appendChild(heart);
  rowsbox.appendChild(frag);
}

function layout() {
  if (!rows.length) return;
  const avail = list.clientWidth;
  let widest = 0;
  for (const n of names) if (n.offsetWidth > widest) widest = n.offsetWidth;
  colw = Math.min(NUMW + widest + COLGAP, avail);
  const cols = clamp(Math.floor(avail / colw), 1, rows.length);
  percol = Math.ceil(rows.length / cols);
  rows.forEach((row, i) => {
    row.style.width = colw + "px";
    row.style.left = (Math.floor(i / percol) * colw) + "px";
    row.style.top = ((i % percol) * ROWH) + "px";
  });
  rowsbox.style.height = (percol * ROWH + 4) + "px";
  placeheart();
}

function setchapter(c) {
  chapter = c;
  view = tracks.filter(t => t.ch === c.id);
  tabs.forEach((tab, i) => tab.classList.toggle("on", CHAPTERS[i] === c));
  buildlist();
  layout();
  scrollto(0);
  const i = view.findIndex(t => loaded === srcof(t));
  select(i < 0 ? 0 : i);
  revealcurrent();
}

function buildpanel() {
  for (const c of CONTROLS) {
    const el = document.createElement("div");
    el.className = "pline" + (c.act ? " pbutton" : "");
    if (c.act) el.onclick = c.act;
    controls.appendChild(el);
    plines.push(el);
  }
}

function refreshpanel() {
  CONTROLS.forEach((c, i) => settext(plines[i], c.label(), "fnt_main"));
}

function drawseek() {
  const dur = audio.duration || 0;
  const cur = audio.currentTime || 0;
  seekfill.style.width = (dur ? (cur / dur) * 100 : 0) + "%";
  settext(timetext, fmt(cur) + " / " + fmt(dur), "fnt_small");
}

function tick() {
  drawseek();
  raf = audio.paused ? 0 : requestAnimationFrame(tick);
}

/*//////////////////////////////////////////////////////////////////////*/

function seekto(e) {
  if (!audio.duration) return;
  const r = seek.getBoundingClientRect();
  audio.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * audio.duration;
}

function onwheel(e) {
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * (NOTCH / 3) : e.deltaMode === 2 ? e.deltaY * list.clientHeight : e.deltaY;
  if (wheelacc && Math.sign(px) !== Math.sign(wheelacc)) wheelacc = 0;
  wheelacc += px;
  const steps = Math.trunc(wheelacc / NOTCH);
  if (!steps) return;
  wheelacc -= steps * NOTCH;
  scrollto(snap(list.scrollTop) + steps * ROWSPERNOTCH * ROWH);
}

function wire() {
  list.addEventListener("wheel", onwheel, {passive: false});
  panel.addEventListener("wheel", onwheel, {passive: false});
  tabsbox.addEventListener("wheel", onwheel, {passive: false});
  window.addEventListener("resize", layout);

  list.addEventListener("pointerdown", e => {
    dragmoved = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = {y: e.clientY, top: snap(list.scrollTop), id: e.pointerId};
  });

  list.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!dragmoved && Math.abs(dy) < CLICKSLOP) return;
    if (!dragmoved) {
      dragmoved = true;
      list.classList.add("grabbing");
      try {list.setPointerCapture(e.pointerId)} catch {}
    }
    scrollto(snap(drag.top - dy));
  });

  const enddrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    list.classList.remove("grabbing");
    if (list.hasPointerCapture(e.pointerId)) list.releasePointerCapture(e.pointerId);
  };
  list.addEventListener("pointerup", enddrag);
  list.addEventListener("pointercancel", enddrag);

  list.addEventListener("click", e => {
    if (dragmoved) return;
    const row = e.target.closest?.(".row");
    if (row) pick(+row.dataset.i);
  });

  const endseek = e => {
    seeking = false;
    if (seek.hasPointerCapture(e.pointerId)) seek.releasePointerCapture(e.pointerId);
  };
  seek.addEventListener("pointerdown", e => {
    seeking = true;
    try {seek.setPointerCapture(e.pointerId)} catch {}
    seekto(e);
  });
  seek.addEventListener("pointermove", e => {if (seeking) seekto(e)});
  seek.addEventListener("pointerup", endseek);
  seek.addEventListener("pointercancel", endseek);

  audio.addEventListener("play", () => {refreshpanel(); if (!raf) raf = requestAnimationFrame(tick)});
  audio.addEventListener("pause", () => {refreshpanel(); drawseek()});
  audio.addEventListener("loadedmetadata", drawseek);
  audio.addEventListener("seeked", drawseek);
  audio.addEventListener("ended", () => {
    if (!auto) {refreshpanel(); return}
    if (current < last()) {select(current + 1); revealcurrent(); play(); return}
    const next = CHAPTERS[CHAPTERS.indexOf(chapter) + 1];
    if (!next) {refreshpanel(); return}
    setchapter(next);
    play();
  });
}

/*//////////////////////////////////////////////////////////////////////*/

tracks = await (await fetch("assets/tracks.json")).json();
buildtabs();
buildpanel();
wire();
setchapter(CHAPTERS[0]);
refreshpanel();
drawseek();
