'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_INITIAL_INK,
  DEFAULT_KEYCAP_INK,
  DEFAULT_ZERO_INITIAL_INK,
  INITIAL_LINK_INK,
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
} = require('./keymap_link_colors.js');

const START = '/* KEYMAP_LINK_COLORS_START: tools/keymap_link_colors.js */';
const END = '/* KEYMAP_LINK_COLORS_END */';
const RUNTIME_START = '/* KEYMAP_LINK_RUNTIME_START */';
const RUNTIME_END = '/* KEYMAP_LINK_RUNTIME_END */';

function generatedSourceBlock(newline = '\n') {
  const lines = [
    START,
    `const KEYMAP_LINK_COLOR_CONTRACT=Object.freeze({traditionalInitials:new Set([...${JSON.stringify(TRADITIONAL_INITIALS)}]),minimumDistance:${MINIMUM_OKLAB_DISTANCE},defaultKeycapInk:${JSON.stringify(DEFAULT_KEYCAP_INK)},defaultInitialInk:${JSON.stringify(DEFAULT_INITIAL_INK)},defaultZeroInitialInk:${JSON.stringify(DEFAULT_ZERO_INITIAL_INK)},initialLinkInk:Object.freeze(${JSON.stringify(INITIAL_LINK_INK)}),zeroLinkStyle:Object.freeze(${JSON.stringify(ZERO_LINK_STYLE)}),ordinaryCandidates:Object.freeze(${JSON.stringify(ORDINARY_LINK_CANDIDATES)}),zeroCandidates:Object.freeze(${JSON.stringify(ZERO_LINK_CANDIDATES)})});`,
    'const ordinaryHomeInitials=KEYMAP_LINK_COLOR_CONTRACT.traditionalInitials;',
    keymapLinkOklab.toString(),
    keymapLinkColorDistance.toString(),
    resolveKeymapLinkColors.toString(),
    validateKeymapLinkContrast.toString(),
    keymapLinkLegendHtml.toString(),
    END,
  ];
  return lines.join(newline);
}

function generatedRuntimeBlock(newline = '\n') {
  return [
    RUNTIME_START,
    'const keymapLinkState={letterKeys,semantics,ordinaryTargets,ordinaryMoved,zeroTargets,zeroMoved,isDirectOnset:directOnset},keymapLinkColors=resolveKeymapLinkColors(keymapLinkState);',
    'validateKeymapLinkContrast(keymapLinkState,keymapLinkColors);',
    'const initialLinkInk=keymapLinkColors.initialLinkInk,zeroLinkStyle=keymapLinkColors.zeroLinkStyle;',
    RUNTIME_END,
  ].join(newline);
}

function syncPublicationHtml(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const generated = generatedSourceBlock(newline);
  let output = source;
  const generatedPattern = /\/\* KEYMAP_LINK_COLORS_START: tools\/keymap_link_colors\.js \*\/[\s\S]*?\/\* KEYMAP_LINK_COLORS_END \*\//u;
  if (generatedPattern.test(output)) {
    output = output.replace(generatedPattern, generated);
  } else {
    const legacyPattern = /,ordinaryHomeInitials=new Set\(\[\.\.\."bpmfdtnlgkhjqxrzcs"\]\),initialLinkInk=\{[^;\r\n]+\},zeroLinkStyle=\{[^;\r\n]+\};/u;
    if (!legacyPattern.test(output)) {
      throw new Error('找不到键位图配色常量或生成标记');
    }
    output = output.replace(legacyPattern, `;${newline}${generated}`);
  }

  if (!output.includes('${keymapLinkLegendHtml()}')) {
    const legendPattern = /<span class="legenditem"><span style="color:#e83e8c">Q／[\s\S]*?<span class="legenditem"><span class="legzero">Ø A\/E\/O<\/span> 保持常规零声母配色<\/span>/u;
    if (!legendPattern.test(output)) throw new Error('找不到键位图 link 配色图例');
    output = output.replace(legendPattern, '${keymapLinkLegendHtml()}');
  }

  const runtime = generatedRuntimeBlock(newline);
  const runtimePattern = /\/\* KEYMAP_LINK_RUNTIME_START \*\/[\s\S]*?\/\* KEYMAP_LINK_RUNTIME_END \*\//u;
  if (runtimePattern.test(output)) {
    output = output.replace(runtimePattern, runtime);
  } else {
    output = output.replace(
      /;validateKeymapLinkContrast\(\{letterKeys,semantics,ordinaryTargets,ordinaryMoved,zeroTargets,zeroMoved,isDirectOnset:directOnset\}\);let ni=0;/u,
      ';let ni=0;',
    );
    output = output.replace(
      /;const keymapLinkState=\{letterKeys,semantics,ordinaryTargets,ordinaryMoved,zeroTargets,zeroMoved,isDirectOnset:directOnset\},keymapLinkColors=resolveKeymapLinkColors\(keymapLinkState\);validateKeymapLinkContrast\(keymapLinkState,keymapLinkColors\);const initialLinkInk=keymapLinkColors\.initialLinkInk,zeroLinkStyle=keymapLinkColors\.zeroLinkStyle;let ni=0;/u,
      ';let ni=0;',
    );
    const statePattern = /(zeroMoved=\{W:[^;\r\n]+,Y:[^;\r\n]+\});let ni=0;/u;
    if (!statePattern.test(output)) throw new Error('找不到键位图位移状态计算');
    output = output.replace(statePattern, `$1;${newline}${runtime}${newline}let ni=0;`);
  }
  return output;
}

function parseArgs(argv) {
  const args = {check: false, html: path.resolve(__dirname, '..', 'a7_CKT_R11.html')};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') args.check = true;
    else if (argv[index] === '--html') args.html = path.resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const source = fs.readFileSync(args.html, 'utf8');
  const updated = syncPublicationHtml(source);
  if (args.check) {
    if (updated !== source) throw new Error(`${args.html} 的键位图配色生成块已过期`);
    console.log(`键位图 link 配色生成块与链式校验均为最新：${args.html}`);
    return;
  }
  if (updated === source) {
    console.log(`键位图 link 配色无需更新：${args.html}`);
    return;
  }
  fs.writeFileSync(args.html, updated);
  console.log(`已同步键位图 link 配色、图例与链式校验：${args.html}`);
}

if (require.main === module) main();

module.exports = {generatedRuntimeBlock, generatedSourceBlock, main, syncPublicationHtml};
