import {fonts} from "./assets/fonts/fonts.js";

const DEFAULT = "fnt_main";
const styledfonts = new Set();

function ensurefontstyle(name) {
  if (styledfonts.has(name)) return;
  const font = fonts[name]; if (!font) return;
  styledfonts.add(name);
  let css = "";
  const map = font.glyphs;
  for (const code in map) {
    const [x, y, w, h, shift, offset] = map[code];
    css += ".g-" + name + "-" + code + "{--gs:" + shift + "px;--gw:" + w + "px;--gh:" + h + "px;--go:" + offset + "px;--gp:" + (-x) + "px " + (-y) + "px}\n";
  }
  const st = document.createElement("style");
  st.dataset.font = name;
  st.textContent = css;
  document.head.appendChild(st);
}

function glyph(ch, map, name) {
  const g = document.createElement("span");
  const code = ch.codePointAt(0);
  if (map[code]) g.className = "glyph g-" + name + "-" + code;
  else {g.className = "glyphx"; g.textContent = ch}
  return g;
}

export function rendertext(str, name = DEFAULT) {
  const nm = fonts[name] ? name : DEFAULT;
  ensurefontstyle(nm);
  const map = fonts[nm].glyphs;
  const frag = document.createDocumentFragment();
  for (const ch of str) frag.appendChild(ch === "\n" ? document.createElement("br") : glyph(ch, map, nm));
  return frag;
}

function applyfont(el, name) {
  const font = fonts[name] || fonts[DEFAULT];
  const href = new URL(font.atlas, document.baseURI).href;
  el.style.setProperty("--atlas", 'url("' + href + '")');
  el.style.setProperty("--lh", font.lh + "px");
}

export function settext(el, str, name = DEFAULT) {
  if (el.dataset.txt === str && el.dataset.fnt === name) return;
  el.dataset.txt = str;
  el.dataset.fnt = name;
  el.classList.add("font");
  applyfont(el, name);
  el.textContent = "";
  el.appendChild(rendertext(str, name));
}
