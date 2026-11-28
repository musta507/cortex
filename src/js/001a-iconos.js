/* ---------- iconos en vez de emojis ----------
   Toda la interfaz se pinta con iconos de línea (iguales en todo Cortex). Los emojis que aún llevan los textos de botones,
   avisos y menús se cambian solos por su icono al aparecer en la pantalla; los que no tienen icono se quitan.
   No se toca lo que escribe la gente (títulos, chat, notas, nombres de clips) ni el selector de emojis. */
const IC = {
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
  message: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  pencil: '<path d="M17 3l4 4L8 20H4v-4z"/><path d="M14 6l4 4"/>',
  clapper: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l2.5-5 15 3L18 9M8.5 4.7L7 9M14 5.8L12.5 9"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 12h18M3 16h4M17 8h4M17 16h4"/>',
  mute: '<path d="M11 5L6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>',
  sound: '<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v2M15 13v2M2 13v3M22 13v3"/><circle cx="12" cy="3.5" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  rec: '<circle cx="12" cy="12" r="5" fill="#ff4d4d" stroke="none"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" opacity=".55"/>',
  green: '<circle cx="12" cy="12" r="5" fill="#4ade80" stroke="none"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.2-.9"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  rewind: '<path d="M11 19l-9-7 9-7zM22 19l-9-7 9-7z"/>',
  forward: '<path d="M13 19l9-7-9-7zM2 19l9-7-9-7z"/>',
  skipback: '<path d="M19 20L9 12l10-8zM5 19V5"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.4 6.5 20.4l1-6.3L3 9.7l6.2-.9z" fill="currentColor"/>',
  staro: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.4 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-6.8 0-4.4-3.6-6.8-4.4-11.2-2.2 1.6-3.4 4.1-3.2 6.6C10 9.6 9 8.4 8.8 6.8 6.4 8.8 5 11.8 5 15.2 5 19.2 8 22 12 22z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>',
  brush: '<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2z"/><path d="M4 20l3-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.4-5.5 7-5.5s6.2 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c2 .8 3.1 2.6 3.5 5.2"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  tv: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 2l4 4 4-4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  hook: '<path d="M12 3v11a4 4 0 1 1-8 0M12 3h4M16 3v3"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  masks: '<path d="M3 4h12v6a6 6 0 0 1-12 0z"/><path d="M7 8h.01M11 8h.01M6.5 12a3 3 0 0 0 5 0"/><path d="M15 9h6v5a6 6 0 0 1-8.5 5.5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><rect x="3" y="15" width="5" height="6" rx="1.5"/><rect x="16" y="15" width="5" height="6" rx="1.5"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  game: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
};
const ic = (n, cls) => IC[n] ? `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>` : '';
// qué emoji va con qué icono ('' = se quita)
const IC_EMO = {
  '✨': 'sparkles', '✂': 'scissors', '⏳': 'hourglass', '⌛': 'hourglass', '💬': 'message', '🗨': 'message', '🗑': 'trash', '✅': 'checkc', '✔': 'check', '☑': 'checkc', '👍': 'check',
  '✏': 'pencil', '✍': 'pencil', '📝': 'file', '🎬': 'clapper', '🎞': 'film', '🔇': 'mute', '🔊': 'sound', '🔉': 'sound', '🔈': 'sound', '🎨': 'palette', '🤖': 'bot',
  '🔍': 'search', '🔎': 'search', '🎙': 'mic', '🎤': 'mic', '🖼': 'image', '📷': 'image', '💾': 'save', '🔴': 'rec', '⚫': 'dot', '⚪': 'dot', '🟢': 'green', '📋': 'clipboard', '🧬': 'copy',
  '👁': 'eye', '👀': 'eye', '🙈': 'eyeoff', '📱': 'phone', '📍': 'pin', '📌': 'pin', '🚫': 'ban', '⛔': 'ban', '⏪': 'rewind', '⏩': 'forward', '⏮': 'skipback', '⏸': 'pause',
  '⭐': 'star', '🌟': 'star', '★': 'star', '☆': 'staro', '🔥': 'flame', '➕': 'plus', '📁': 'folder', '📂': 'folder', '🗂': 'folder', '⬇': 'download', '📥': 'download', '📤': 'upload', '⬆': 'upload', '⚙': 'gear', '🛠': 'gear', '🔧': 'gear',
  '📄': 'file', '📘': 'book', '📚': 'book', '📖': 'book', '🧲': 'magnet', '🔗': 'link', '🔤': 'type', '🧪': 'flask', '🧹': 'brush', '🧑‍💼': 'user', '👤': 'user', '🧑': 'user', '💼': 'user', '👥': 'users',
  '⚡': 'zap', '📺': 'tv', '⏱': 'timer', '⏲': 'timer', '🕐': 'history', '🕘': 'history', '🪝': 'hook', '💡': 'bulb', '📡': 'radio', '🎭': 'masks', '🔒': 'lock', '🔓': 'lock', '🎥': 'video', '📹': 'video',
  '🎧': 'headphones', '🎵': 'music', '🎶': 'music', '📞': 'call', '☎': 'call', '🖥': 'monitor', '💻': 'monitor', '🎚': 'sliders', '🎛': 'sliders', '🏷': 'tag', '🎯': 'target', '📦': 'box', '📊': 'chart', '📈': 'chart',
  '⚠': 'alert', '❗': 'alert', '❌': '', '❤': 'heart', '🎮': 'game', '🧩': 'layout', '🔄': 'refresh', '🔁': 'refresh', '▶': 'play', '⏯': 'play',
  // sin icono: se quitan
  '🤬': '', '😠': '', '💀': '', '🔪': '', '🔞': '', '💊': '', '🎰': '', '🆓': '', '💎': '', '⚖': '', '🙂': '', '😅': '', '🎉': '', '🥇': '', '🏆': '', '🧠': '', '🧑‍🤝‍🧑': '', '🌍': '', '🗣': '', '🐢': '', '🚀': '', '👋': '', '🤝': '', '🙌': '', '💪': '', '🎁': '', '🧾': '', '📣': '', '📢': '', '🔔': '', '🔕': '', '🧯': '', '🪄': '', '⌨': '', '🖱': '', '🧭': '',
};
const IC_KEYS = Object.keys(IC_EMO).sort((a, b) => b.length - a.length);
const IC_RE = new RegExp('(' + IC_KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'u');
const IC_RE_G = new RegExp(IC_RE.source, 'gu');
const icStrip = t => String(t == null ? '' : t).replace(new RegExp(IC_RE.source + '\\s?', 'gu'), '');   // para lo que se pinta en un lienzo
// dónde NO se toca: lo que escribe la gente y el selector de emojis
const IC_SKIP = 'textarea,input,[contenteditable=""],[contenteditable="true"],.emobtn,#emojiPop,.emojipop,.lc-list,.lv-chat,.rinfo,.lh-pop .lh-t,.cmdk-list .cmdk-i span,.nt-body,.nt-list,.tt-pv,.tt-n,.se-chips,.no-ic,script,style,svg';
function icText(node) {
  const t = node.data; if (!IC_RE.test(t)) return;
  const p = node.parentNode; if (!p || p.nodeType !== 1) return;
  if (p.closest(IC_SKIP)) return;
  if (p.tagName === 'OPTION' || p.tagName === 'TITLE') { node.data = t.replace(new RegExp(IC_RE.source + '\\s?', 'gu'), ''); return; }
  const frag = document.createDocumentFragment(); let last = 0; IC_RE_G.lastIndex = 0; let m;
  while ((m = IC_RE_G.exec(t))) {
    let before = t.slice(last, m.index); const name = IC_EMO[m[1]];
    let after = m.index + m[0].length;
    const sp = t[after] === ' ';
    if (before) frag.append(before);
    if (name) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
      s.setAttribute('class', 'ic' + (sp ? ' ic-l' : '') + (before && !/\s$/.test(before) ? ' ic-r' : '')); s.innerHTML = IC[name]; frag.append(s);
    }
    if (sp) after++;
    last = after;
  }
  const rest = t.slice(last); if (rest) frag.append(rest);
  p.replaceChild(frag, node);
}
function icAttrs(el) { for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (v && IC_RE.test(v) && !el.closest('.emobtn,#emojiPop')) el.setAttribute(a, v.replace(new RegExp(IC_RE.source + '\\s?', 'gu'), '').trim()); } }
function icScan(root) {
  if (!root) return;
  if (root.nodeType === 3) { icText(root); return; }
  if (root.nodeType !== 1 || root.closest && root.closest('script,style,svg')) return;
  icAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), todo = [];
  let n; while ((n = w.nextNode())) { if (n.nodeType === 3) { if (IC_RE.test(n.data)) todo.push(n); } else if (n.hasAttribute && (n.hasAttribute('title') || n.hasAttribute('placeholder'))) icAttrs(n); }
  for (const x of todo) icText(x);
}
setTimeout(() => {
  icScan(document.body);
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') icText(m.target); else if (m.type === 'attributes') icAttrs(m.target); else for (const n of m.addedNodes) icScan(n); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
}, 0);
