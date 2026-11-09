import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  INITIAL_LINK_INK,
  KEYMAP_LINK_COLOR_CONTRACT,
  MINIMUM_OKLAB_DISTANCE,
  ZERO_LINK_STYLE,
  keymapLinkColorDistance,
  resolveKeymapLinkColors,
  validateKeymapLinkContrast,
} = require('../tools/keymap_link_colors.js');
const {syncPublicationHtml} = require('../tools/sync_keymap_link_colors.js');

function d3State() {
  return {
    letterKeys: ['Q', 'W', 'S', 'F', 'J', 'Y', 'X'],
    semantics: {
      Q: {roles: ['s']},
      W: {roles: ['Ø Y/YU']},
      S: {roles: ['zh']},
      F: {roles: ['q']},
      J: {roles: ['Ø W']},
      Y: {roles: ['x', 'Ø A/E/O']},
      X: {roles: ['ch']},
    },
    ordinaryTargets: {q: ['F'], s: ['Q'], x: ['Y']},
    ordinaryMoved: {q: true, s: true, x: true},
    zeroTargets: {W: ['J'], Y: ['W']},
    zeroMoved: {W: true, Y: true},
    isDirectOnset: () => false,
  };
}

test('D3/V1 moved-initial chains satisfy the universal OKLab threshold', () => {
  assert.equal(MINIMUM_OKLAB_DISTANCE, 0.18);
  const colors = resolveKeymapLinkColors(d3State());
  assert.doesNotThrow(() => validateKeymapLinkContrast(d3State(), colors));
  assert.equal(colors.initialLinkInk.q, INITIAL_LINK_INK.q);
  assert.equal(colors.initialLinkInk.s, INITIAL_LINK_INK.s);
  assert.equal(colors.initialLinkInk.x, INITIAL_LINK_INK.x);
  assert.equal(colors.zeroLinkStyle.W.ink, ZERO_LINK_STYLE.W.ink);
  assert.equal(colors.zeroLinkStyle.Y.ink, ZERO_LINK_STYLE.Y.ink);
  assert.ok(keymapLinkColorDistance(INITIAL_LINK_INK.x, '#66506a') >= MINIMUM_OKLAB_DISTANCE);
  assert.ok(keymapLinkColorDistance(INITIAL_LINK_INK.x, ZERO_LINK_STYLE.Y.ink) >= MINIMUM_OKLAB_DISTANCE);
  assert.ok(keymapLinkColorDistance(ZERO_LINK_STYLE.W.ink, ZERO_LINK_STYLE.Y.ink) >= MINIMUM_OKLAB_DISTANCE);
});

test('the checker rejects the formerly similar X/ch and x/Y colors', () => {
  const oldContract = {
    ...KEYMAP_LINK_COLOR_CONTRACT,
    initialLinkInk: {...INITIAL_LINK_INK, x: '#7e57c2'},
    zeroLinkStyle: {
      W: {ink: '#5f7f86', fill: '#e2edf0', stroke: '#789aa2'},
      Y: {ink: '#8a6d82', fill: '#f0e5ec', stroke: '#aa879e'},
    },
  };
  assert.throws(
    () => validateKeymapLinkContrast(d3State(), oldContract),
    /OKLab 色差 .* 小于 0\.18/u,
  );
});

test('publication sync is idempotent and injects source, legend, and runtime checking', () => {
  const legacy = `const fs=1,ordinaryHomeInitials=new Set([..."bpmfdtnlgkhjqxrzcs"]),initialLinkInk={q:'#old'},zeroLinkStyle={W:{ink:'#old'}};
function keyboardSVG(){const zeroMoved={W:true,Y:true};let ni=0;return \`<div><span class="legenditem"><span style="color:#e83e8c">Q／old</span> legacy <span class="legenditem"><span class="legzero">Ø A/E/O</span> 保持常规零声母配色</span></div>\`;}`;
  const generated = syncPublicationHtml(legacy);
  assert.match(generated, /KEYMAP_LINK_COLORS_START/u);
  assert.match(generated, /\$\{keymapLinkLegendHtml\(\)\}/u);
  assert.match(generated, /KEYMAP_LINK_RUNTIME_START/u);
  assert.match(generated, /resolveKeymapLinkColors\(keymapLinkState\)/u);
  assert.match(generated, /validateKeymapLinkContrast\(keymapLinkState,keymapLinkColors\)/u);
  assert.equal(syncPublicationHtml(generated), generated);
});

const artifact = fileURLToPath(new URL('../a7_CKT_R11.html', import.meta.url));
test('local R11 publication matches the tracked color source when available', {skip: !existsSync(artifact)}, () => {
  const html = readFileSync(artifact, 'utf8');
  assert.equal(syncPublicationHtml(html), html);
});
