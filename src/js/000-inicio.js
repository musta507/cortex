<script>
const $ = id => document.getElementById(id);
const cv = $('cv'); let ctx = cv.getContext('2d');   // «let»: la vista previa de las plantillas de título lo cambia un momento para dibujar con lo mismo
const W = 1080, H = 1920;
const vid = $('vid');
let file = null, loaded = false, exporting = false;
let captions = [];     // [{start,end,words:[{text,start,end}]}]
let allWords = [];
let activeCap = -1;
let titleStyle = 'plain', boxMode = 'single';
const titleHL = new Set();           // índices de palabras del título en rojo
const pos = { tx: 0, ty: 0, sx: 0 }; // desplazamientos del título y de los subtítulos (px del vídeo final)
const boxes = { title: null, sub: null, video: null };
let drag = null, hover = null;
let snapX = false, snapY = false;    // para dibujar las guías
let layoutMode = 'single', imgPos = 'bottom', img = null, crop = null, lastLayout = null;
const imgOff = { x: 0, y: 0 };

const S0 = () => ({
  title: $('title').value,
  titleFont: $('titleFont').value.split('|')[0],
  titleWeight: $('titleFont').value.split('|')[1],
  titleSize: +$('titleSize').value,
  titleLH: +$('titleLH').value / 100,
  titleColor: $('titleColor').value,
  titleUpper: $('titleUpper').checked,
  titleY: +$('titleY').value,
  titleW: +$('titleW').value,
  titleHl: $('titleHl').value,
  boxR: +$('boxR').value, boxPX: +$('boxPX').value, boxPY: +$('boxPY').value,
  boxColor: $('boxColor').value, boxText: $('boxText').value,
  boxOp: +$('boxOp').value / 100, tLS: +$('tLS').value, tStrokeW: +$('tStrokeW').value, tStrokeC: $('tStrokeC').value, tShadow: +$('tShadow').value / 100,
  subFont: $('subFont').value.split('|')[0],
  subWeight: $('subFont').value.split('|')[1],
  subSize: +$('subSize').value,
  subLH: +$('subLH').value / 100,
  subColor: $('subColor').value,
  hlColor: $('hlColor').value,
  upper: $('upper').checked,
  hl: $('hl').checked,
  pop: $('pop').checked,
  safe: $('safe').checked,
  subY: +$('subY').value / 100,
  zoom: +$('zoom').value / 100,
  offX: +$('offX').value,
  offY: +$('offY').value,
  bg: $('bg').value,
  shOp: +$('shOp').value / 100,
  shBlur: +$('shBlur').value / 100,
  strokeOn: $('strokeOn').checked,
  strokeW: +$('strokeW').value,
  strokeC: $('strokeC').value,
  ratio: +$('ratio').value / 100,
  edgeT: +$('edgeT').value, edgeB: +$('edgeB').value,
  imgZoom: +$('imgZoom').value / 100,
  logoSize: +$('logoSize').value / 100,
  logoOp: +$('logoOp').value / 100,
  logoRot: +$('logoRot').value,
  subBold: $('subBold').checked, subItalic: $('subItalic').checked, subUnder: $('subUnder').checked,
  subCase: $('subCase').value !== 'none' ? $('subCase').value : ($('upper').checked ? 'upper' : 'none'),
  subLS: +$('subLS').value, subAlign: $('subAlign').value,
  subBg: $('subBg').checked, subBgMode: $('subBgMode').value, subBgC: $('subBgC').value, subBgOp: +$('subBgOp').value / 100,
  subBgR: +$('subBgR').value, subBgH: +$('subBgH').value, subBgW: +$('subBgW').value, subBgX: +$('subBgX').value, subBgY: +$('subBgY').value,
  subShOn: $('subShOn').checked, subShC: $('subShC').value, subShD: +$('subShD').value, subShA: +$('subShA').value,
});
// ayudas de texto: mayúsculas, color con transparencia, desplazamiento de la sombra
function caseText(t, mode) {
  if (mode === 'upper') return t.toLocaleUpperCase('es');
  if (mode === 'lower') return t.toLocaleLowerCase('es');
  if (mode === 'title') { const l = t.toLocaleLowerCase('es'); return l.replace(/(^|[\s¿¡"«(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es')); }
  return t;
}
function rgbaOf(hex, a) { const h = String(hex || '#000').replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0; return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
const shOff = (d, a) => ({ x: d * Math.cos(a * Math.PI / 180), y: -d * Math.sin(a * Math.PI / 180) });

