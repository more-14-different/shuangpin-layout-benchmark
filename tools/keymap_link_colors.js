'use strict';

const TRADITIONAL_INITIALS = 'bpmfdtnlgkhjqxrzcs';
const MINIMUM_OKLAB_DISTANCE = 0.18;
const DEFAULT_KEYCAP_INK = '#4f5962';
const DEFAULT_INITIAL_INK = '#66506a';
const DEFAULT_ZERO_INITIAL_INK = '#765b5c';

const INITIAL_LINK_INK = Object.freeze({
  b: '#d81b60',
  p: '#e64a19',
  m: '#8e24aa',
  f: '#009b88',
  d: '#1e88e5',
  t: '#f4511e',
  n: '#43a047',
  l: '#fb8c00',
  g: '#3949ab',
  k: '#00acc1',
  h: '#7cb342',
  j: '#c2185b',
  q: '#e83e8c',
  x: '#005bd8',
  r: '#ef6c00',
  z: '#0097a7',
  c: '#5e35b1',
  s: '#00a651',
});

const ZERO_LINK_STYLE = Object.freeze({
  W: Object.freeze({ink: '#3e98b0', fill: '#deedf1', stroke: '#6e9eaa'}),
  Y: Object.freeze({ink: '#b67747', fill: '#f2e5da', stroke: '#b88a68'}),
});

const ORDINARY_LINK_CANDIDATES = Object.freeze([
  '#d81b60', '#00a651', '#005bd8', '#fb8c00', '#8e24aa', '#009b88',
  '#e64a19', '#1e88e5', '#43a047', '#3949ab', '#00acc1', '#7cb342',
  '#c2185b', '#ef6c00', '#0097a7', '#5e35b1', '#d50000', '#e65100',
  '#7a9b00', '#008f7a', '#008caf', '#0067c5', '#743bd1', '#d81b8a',
]);

const ZERO_LINK_CANDIDATES = Object.freeze([
  Object.freeze({ink: '#3e98b0', fill: '#deedf1', stroke: '#6e9eaa'}),
  Object.freeze({ink: '#b67747', fill: '#f2e5da', stroke: '#b88a68'}),
  Object.freeze({ink: '#8f75b5', fill: '#ebe5f2', stroke: '#a18eb9'}),
  Object.freeze({ink: '#4f9a72', fill: '#e1eee6', stroke: '#79a88d'}),
  Object.freeze({ink: '#b26875', fill: '#f1e2e5', stroke: '#b98a92'}),
  Object.freeze({ink: '#637fae', fill: '#e4e9f1', stroke: '#8598b8'}),
  Object.freeze({ink: '#9a884a', fill: '#eee9d9', stroke: '#a99c70'}),
  Object.freeze({ink: '#a66f9a', fill: '#efe3ec', stroke: '#ad8aa5'}),
  Object.freeze({ink: '#4c938e', fill: '#dfedeb', stroke: '#75a39f'}),
  Object.freeze({ink: '#b06c5b', fill: '#f1e3df', stroke: '#b68c80'}),
]);

const KEYMAP_LINK_COLOR_CONTRACT = Object.freeze({
  traditionalInitials: new Set([...TRADITIONAL_INITIALS]),
  minimumDistance: MINIMUM_OKLAB_DISTANCE,
  defaultKeycapInk: DEFAULT_KEYCAP_INK,
  defaultInitialInk: DEFAULT_INITIAL_INK,
  defaultZeroInitialInk: DEFAULT_ZERO_INITIAL_INK,
  initialLinkInk: INITIAL_LINK_INK,
  zeroLinkStyle: ZERO_LINK_STYLE,
  ordinaryCandidates: ORDINARY_LINK_CANDIDATES,
  zeroCandidates: ZERO_LINK_CANDIDATES,
});

function keymapLinkOklab(hex) {
  const components = String(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!components) throw new Error(`invalid RGB color: ${JSON.stringify(hex)}`);
  const [red, green, blue] = components.slice(1).map(component => {
    const encoded = Number.parseInt(component, 16) / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  });
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ];
}

function keymapLinkColorDistance(left, right) {
  const leftLab = keymapLinkOklab(left);
  const rightLab = keymapLinkOklab(right);
  return Math.hypot(...leftLab.map((component, index) => component - rightLab[index]));
}

function resolveKeymapLinkColors(state, contract = KEYMAP_LINK_COLOR_CONTRACT) {
  const {
    letterKeys,
    semantics,
    ordinaryTargets,
    ordinaryMoved,
    zeroTargets,
    zeroMoved,
    isDirectOnset,
  } = state;
  const nodes = [];
  const edges = new Map();
  const forbidden = new Map();
  const addNode = node => {
    if (!edges.has(node)) {
      nodes.push(node);
      edges.set(node, new Set());
      forbidden.set(node, new Set());
    }
  };
  const addEdge = (left, right) => {
    if (!left || !right || left === right) return;
    addNode(left);
    addNode(right);
    edges.get(left).add(right);
    edges.get(right).add(left);
  };
  const ordinaryNode = initial => ordinaryMoved[initial] ? `i:${initial}` : null;
  const zeroNode = carrier => zeroMoved[carrier] ? `z:${carrier}` : null;
  for (const initial of contract.traditionalInitials) {
    const node = ordinaryNode(initial);
    if (node) addNode(node);
  }
  for (const carrier of ['W', 'Y']) {
    const node = zeroNode(carrier);
    if (node) addNode(node);
  }
  addEdge(zeroNode('W'), zeroNode('Y'));

  for (const key of letterKeys) {
    const sourceInitial = key.toLowerCase();
    const keycapNode = ordinaryNode(sourceInitial) || (/^[WY]$/.test(key) ? zeroNode(key) : null);
    const roles = (semantics[key]?.roles || []).filter(role => !isDirectOnset(key, role));
    for (const role of roles) {
      const label = String(role);
      const compact = label.replaceAll(' ', '');
      if (compact.startsWith('ØA') || compact.startsWith('ØE') || compact.startsWith('ØO')) {
        continue;
      }
      const zeroCarrier = compact.startsWith('ØW') ? 'W' : compact.startsWith('ØY') ? 'Y' : null;
      const labelNode = zeroCarrier ? zeroNode(zeroCarrier) : ordinaryNode(label.toLowerCase());
      const defaultLabelInk = zeroCarrier
        ? contract.defaultZeroInitialInk
        : contract.defaultInitialInk;
      if (keycapNode && labelNode) addEdge(keycapNode, labelNode);
      else if (keycapNode) forbidden.get(keycapNode).add(defaultLabelInk);
      else if (labelNode) forbidden.get(labelNode).add(contract.defaultKeycapInk);
    }
  }

  const assigned = new Map();
  const candidates = node => {
    if (node.startsWith('i:')) {
      const initial = node.slice(2);
      return [...new Set([contract.initialLinkInk[initial], ...contract.ordinaryCandidates])]
        .map(ink => ({ink}));
    }
    const carrier = node.slice(2);
    const preferred = contract.zeroLinkStyle[carrier];
    const styles = [preferred, ...contract.zeroCandidates];
    return styles.filter((style, index) => styles.findIndex(candidate => candidate.ink === style.ink) === index);
  };
  const compatible = (node, style) => {
    if ([...assigned.values()].some(other => other.ink === style.ink)) return false;
    for (const ink of forbidden.get(node)) {
      if (keymapLinkColorDistance(style.ink, ink) < contract.minimumDistance) return false;
    }
    for (const neighbor of edges.get(node)) {
      const other = assigned.get(neighbor);
      if (other && keymapLinkColorDistance(style.ink, other.ink) < contract.minimumDistance) {
        return false;
      }
    }
    return true;
  };
  let explored = 0;
  const degree = node => edges.get(node).size + forbidden.get(node).size;
  const chooseNode = () => [...nodes]
    .filter(node => !assigned.has(node))
    .sort((left, right) => {
      const saturation = node => new Set(
        [...edges.get(node)]
          .map(neighbor => assigned.get(neighbor)?.ink)
          .filter(Boolean),
      ).size;
      return saturation(right) - saturation(left)
        || degree(right) - degree(left)
        || left.localeCompare(right);
    })[0];
  const assign = () => {
    explored += 1;
    if (explored > 50_000) return false;
    if (assigned.size === nodes.length) return true;
    const node = chooseNode();
    for (const style of candidates(node)) {
      if (!compatible(node, style)) continue;
      assigned.set(node, style);
      if (assign()) return true;
      assigned.delete(node);
    }
    return false;
  };
  if (!assign()) {
    throw new Error(`无法在 50000 个确定性状态内为当前键位图求得 OKLab 色差不小于 ${contract.minimumDistance} 的 link 配色`);
  }
  const initialLinkInk = {...contract.initialLinkInk};
  const zeroLinkStyle = {...contract.zeroLinkStyle};
  for (const [node, style] of assigned) {
    if (node.startsWith('i:')) initialLinkInk[node.slice(2)] = style.ink;
    else zeroLinkStyle[node.slice(2)] = style;
  }
  return {...contract, initialLinkInk, zeroLinkStyle};
}

function validateKeymapLinkContrast(state, contract = KEYMAP_LINK_COLOR_CONTRACT) {
  const {
    letterKeys,
    semantics,
    ordinaryTargets,
    ordinaryMoved,
    zeroTargets,
    zeroMoved,
    isDirectOnset,
  } = state;
  const linkInks = [
    ...[...contract.traditionalInitials]
      .filter(initial => ordinaryMoved[initial])
      .map(initial => contract.initialLinkInk[initial]),
    ...['W', 'Y']
      .filter(carrier => zeroMoved[carrier])
      .map(carrier => contract.zeroLinkStyle[carrier].ink),
  ];
  if (new Set(linkInks).size !== linkInks.length) {
    throw new Error('当前键位图的位移 link 必须各自使用不同前景色');
  }
  for (const key of letterKeys) {
    const sourceInitial = key.toLowerCase();
    const sourceZero = /^[WY]$/.test(key) && zeroMoved[key] ? key : null;
    const movedKeycap = Boolean(ordinaryMoved[sourceInitial] || sourceZero);
    const keycapInk = ordinaryMoved[sourceInitial]
      ? contract.initialLinkInk[sourceInitial]
      : sourceZero
        ? contract.zeroLinkStyle[sourceZero].ink
        : contract.defaultKeycapInk;
    const roles = (semantics[key]?.roles || []).filter(role => !isDirectOnset(key, role));
    for (const role of roles) {
      const label = String(role);
      const compact = label.replaceAll(' ', '');
      if (compact.startsWith('ØA') || compact.startsWith('ØE') || compact.startsWith('ØO')) {
        continue;
      }
      let movedLabel = false;
      let labelInk = contract.defaultInitialInk;
      const zeroCarrier = compact.startsWith('ØW') ? 'W' : compact.startsWith('ØY') ? 'Y' : null;
      if (zeroCarrier) {
        movedLabel = Boolean(zeroMoved[zeroCarrier] && zeroTargets[zeroCarrier].includes(key));
        labelInk = movedLabel
          ? contract.zeroLinkStyle[zeroCarrier].ink
          : contract.defaultZeroInitialInk;
      } else {
        const initial = label.toLowerCase();
        movedLabel = Boolean(
          contract.traditionalInitials.has(initial)
          && ordinaryMoved[initial]
          && ordinaryTargets[initial].includes(key),
        );
        if (movedLabel) labelInk = contract.initialLinkInk[initial];
      }
      if (!movedKeycap && !movedLabel) continue;
      const distance = keymapLinkColorDistance(keycapInk, labelInk);
      if (distance + Number.EPSILON < contract.minimumDistance) {
        throw new Error(
          `${key}/${label}: ${keycapInk} 与 ${labelInk} 的 OKLab 色差 ${distance.toFixed(3)} 小于 ${contract.minimumDistance}`,
        );
      }
    }
  }
}

function keymapLinkLegendHtml(contract = KEYMAP_LINK_COLOR_CONTRACT) {
  return `<span class="legenditem"><span style="color:${contract.initialLinkInk.q}">Q／<u>q</u></span> 同一高饱和色＝迁出源键与迁入声母；位移链色还须与所在键的声母键字母保持大色差</span><span class="legenditem"><span style="color:${contract.zeroLinkStyle.W.ink}">W／<i>Ø W</i></span>、<span style="color:${contract.zeroLinkStyle.Y.ink}">Y／<i>Ø Y</i></span> 各用独立莫兰迪前景、背景与虚线框，并遵守同一色差规则</span><span class="legenditem"><b>F</b> 粗体＝同名传统声母仍在原键；细体＝已离开</span><span class="legenditem"><span class="legzero">Ø A/E/O</span> 保持常规零声母配色</span>`;
}

module.exports = {
  DEFAULT_INITIAL_INK,
  DEFAULT_KEYCAP_INK,
  DEFAULT_ZERO_INITIAL_INK,
  INITIAL_LINK_INK,
  KEYMAP_LINK_COLOR_CONTRACT,
  MINIMUM_OKLAB_DISTANCE,
  ORDINARY_LINK_CANDIDATES,
  TRADITIONAL_INITIALS,
  ZERO_LINK_CANDIDATES,
  ZERO_LINK_STYLE,
  keymapLinkColorDistance,
  keymapLinkLegendHtml,
  keymapLinkOklab,
  resolveKeymapLinkColors,
  validateKeymapLinkContrast,
};
