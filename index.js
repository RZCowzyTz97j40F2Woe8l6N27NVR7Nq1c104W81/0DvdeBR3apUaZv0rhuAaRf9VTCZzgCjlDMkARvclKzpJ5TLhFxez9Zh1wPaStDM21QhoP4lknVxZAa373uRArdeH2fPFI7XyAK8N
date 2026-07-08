import {settext} from "./font.js";

const ROWH = 28;
const MINPITCH = 0.2, MAXPITCH = 3;
const CLICKSLOP = 4;
const NOTCH = 100, ROWSPERNOTCH = 1;

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

let tracks = [];
let current = 0, loaded = -1;
let auto = 0, pitch = 1;
let raf = 0, drag = null, dragmoved = false, seeking = false, wheelacc = 0;

const rows = [];
const plines = [];
let heart;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const last = () => tracks.length - 1;
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
];

function play() {
  const t = tracks[current];
  if (!t) return;
  if (loaded !== current) {
    audio.src = "assets/audio/ch" + t.ch + "/" + encodeURIComponent(t.f);
    loaded = current;
  }
  else {
    try {audio.currentTime = 0} catch {}
  }
  audio.playbackRate = pitch;
  audio.play().catch(() => {});
  refreshpanel();
}

function toggleplay() {
  if (!audio.paused) {audio.pause(); return}
  if (loaded === current && audio.currentTime > 0 && !audio.ended) {audio.play().catch(() => {}); return}
  play();
}

function stop() {
  audio.pause();
  try {audio.currentTime = 0} catch {}
  refreshpanel();
  drawseek();
}

function setpitch(p) {
  pitch = clamp(Math.round(p * 10) / 10, MINPITCH, MAXPITCH);
  audio.playbackRate = pitch;
  refreshpanel();
}

function select(i) {
  const next = clamp(i, 0, last());
  rows[current]?.classList.remove("on");
  current = next;
  rows[current].classList.add("on");
  heart.style.top = (current * ROWH + 8) + "px";
}

function pick(i) {
  select(i);
  play();
}

function scrollto(top) {
  list.scrollTop = top;
}

function revealcurrent() {
  const top = current * ROWH;
  if (top >= list.scrollTop && top + ROWH <= list.scrollTop + list.clientHeight) return;
  scrollto(snap(top - (list.clientHeight - ROWH) / 2));
}

/*//////////////////////////////////////////////////////////////////////*/

function buildlist() {
  const frag = document.createDocumentFragment();
  tracks.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.i = i;
    row.style.top = (i * ROWH) + "px";
    const num = document.createElement("div");
    num.className = "num";
    const rid = document.createElement("div");
    rid.className = "rid";
    const name = document.createElement("div");
    name.className = "name";
    settext(num, "#" + t.n, "fnt_main");
    settext(rid, "ch" + t.ch, "fnt_small");
    settext(name, t.t, "fnt_mainbig");
    row.append(num, rid, name);
    frag.appendChild(row);
    rows.push(row);
  });
  heart = document.createElement("img");
  heart.className = "heart";
  heart.src = "assets/images/heart.png";
  heart.alt = "";
  frag.appendChild(heart);
  rowsbox.style.height = (tracks.length * ROWH + 4) + "px";
  rowsbox.appendChild(frag);
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
    if (!auto || current >= last()) {refreshpanel(); return}
    select(current + 1);
    revealcurrent();
    play();
  });
}

/*//////////////////////////////////////////////////////////////////////*/

tracks = await (await fetch("assets/tracks.json")).json();
buildlist();
buildpanel();
wire();
select(0);
refreshpanel();
drawseek();
