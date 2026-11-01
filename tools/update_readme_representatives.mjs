import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {score} = require('./integrate_completion_ckt_v4.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(readFileSync(path.join(root, 'docs', 'CKT_v4_ALL_SCHEMES_RESULTS.json'), 'utf8'));
const generated = {
  representatives: {
    start: '<!-- README_REPRESENTATIVES:START（由 tools/update_readme_representatives.mjs 生成，请勿手改） -->',
    end: '<!-- README_REPRESENTATIVES:END -->',
  },
  adoption: {
    start: '<!-- README_ADOPTION:START（由 tools/update_readme_representatives.mjs 生成，请勿手改） -->',
    end: '<!-- README_ADOPTION:END -->',
  },
};

const historical = [
  ['SNF4-M37-AE-12', 'NF4', '21×26', '37/4/0', '399', '9.9692 / 10.6046 / 9.0590', '67.855'],
  ['R2-21X21-M38-01', 'R2', '21×21', '38/0/5', '373', '10.7153 / 10.7618 / 9.6446', '86.832'],
  ['R3-21X21-M43-06', 'R3', '21×21', '43/0/5', '373', '10.6631 / 10.6797 / 9.5851', '95.221'],
  ['R4-21X21-M41-07', 'R4', '21×21', '41/0/5', '373', '10.3236 / 10.7454 / 9.4286', '88.827'],
  ['R5-21X26-M39-09', 'R5', '21×26', '39/3/2', '399', '10.0252 / 10.6172 / 9.0640', '68.716'],
  ['R6-21X26-M42-16', 'R6', '21×26', '42/1/5', '399', '10.3905 / 10.6906 / 9.4175', '70.856'],
  ['R7-21X21-M40-01', 'R7', '21×21', '40/0/5', '373', '10.3619 / 10.7235 / 9.4840', '87.031'],
  ['R8-21X21-M40-01', 'R8', '21×21', '40/0/5', '373', '10.4131 / 10.7489 / 9.4988', '82.038'],
  ['R9-21X26-M37-05', 'R9', '21×26', '37/4/0', '399', '9.9382 / 10.5892 / 9.0343', '67.490'],
  ['R10-21X26-M39-08', 'R10', '21×26', '39/5/0', '399', '9.9167 / 10.5691 / 9.0195', '67.324'],
  ['R11-21X26-M39-05', 'R11 冻结', '21×26', '39/5/0', '399', '9.9158 / 10.5724 / 9.0241', '67.215'],
];

const postR11 = [
  {
    label: 'P3-Finetune-best',
    stage: 'P3 · 21×21 低温微调',
    domain: '21×21', mdv: '40/0/5', unique: '—', cktV4: 9.420200447339049,
    evidence: ['97b58a868caab6734afd150b687ecc2e0a8333bf', 'research/milestones/finetune/finetune-batch-04-gen-0100.json'],
  },
  {
    label: 'U357-21X21-M40-D0',
    stage: 'P4 · ProdGate／实战',
    domain: '21×21', mdv: '40/0/5', unique: '357', cktV4: 9.716420811869073,
    ensemble: '10.4733 / 10.8046 / 9.5129', completion: '89.917',
    evidence: ['11713b652cd6a2350d8bf6d0a16d3383d8f0038f', 'research/notes/2026-10-29-prodgate-directed-repair-final-report.md'],
  },
  {
    label: 'P5-Wide-best',
    stage: 'P5 · 21×26 宽域速度极值',
    domain: '21×26', mdv: '≤46/≤10/≤1', unique: '—', cktV4: 8.949768349178292,
    evidence: ['dc3b0ca4852d923f2384385910e3907eeb766d6e', 'research/seeds/ckt-v4/low-disp-20261026-gen0400/manifest.json'],
  },
  {
    label: 'P6-D1-Speed',
    stage: 'P6 · D≤1 速度极值',
    domain: '21×26', mdv: '37/1/1', unique: '—', cktV4: 9.167862,
    evidence: ['7a7e154f3f7d0c86653ee15e755ccd72e866e5e2', 'research/milestones/strict-d0/2026-10-30-strict-d0-production-closure-report.md'],
  },
  {
    label: 'Overall-17',
    stage: 'P6 · 低记忆均衡／实战',
    domain: '21×26', mdv: '36/1/1', unique: '399', cktV4: 9.185254321702468,
    ensemble: '10.8219 / 10.6847 / 9.5341', completion: '75.672',
    evidence: ['7a7e154f3f7d0c86653ee15e755ccd72e866e5e2', 'research/milestones/strict-d0/2026-10-30-strict-d0-production-closure-report.md'],
  },
  {
    label: 'P8-D3-Speed',
    stage: 'P8 · D≤3 速度极值',
    domain: '21×26', mdv: '38/3/1', unique: '—', cktV4: 9.050693,
    evidence: ['70545d9f182a97700f7b404e18487fb12738ce01', 'research/milestones/m40-d3/2026-10-31-m40-d3-production-final-report.md'],
  },
  {
    label: 'P8-D3-V0',
    stage: 'P8 · 基础元音原位极值',
    domain: '21×26', mdv: '38/3/0', unique: '—', cktV4: 9.073755,
    evidence: ['70545d9f182a97700f7b404e18487fb12738ce01', 'research/milestones/m40-d3/2026-10-31-m40-d3-production-final-report.md'],
  },
];

const targets = [
  {file: 'README.md', forge: 'github'},
  {file: 'README_CN.md', forge: 'gitee'},
];

function repoUrl(forge, repo, ref = 'main', file = '') {
  const hosts = {
    github: {host: 'https://github.com', benchmark: 'more-14-different/shuangpin-layout-benchmark', rime: 'ChenZhu-Xie/rime-snow-pinyin'},
    gitee: {host: 'https://gitee.com', benchmark: 'xie-chenzhu/shuangpin-layout-benchmark', rime: 'xie-chenzhu/rime-snow-pinyin'},
  };
  const source = hosts[forge];
  return `${source.host}/${source[repo]}/blob/${ref}/${file}`;
}

function markdownLink(label, url) {
  return `[${label}](${url})`;
}

function historicalCktV4(id) {
  const row = results.schemes[id];
  if (!row || !results.schemes.S005) throw new Error(`CKT v4 结果缺少方案：${id}`);
  return score(row.modes, results.schemes.S005.modes, results.cognitiveDefaults).toFixed(6);
}

function representativeSection(forge) {
  const rows = historical.map(([id, stage, domain, mdv, unique, ensemble, completion]) =>
    `| \`${id}\` | ${stage} | ${domain} | ${mdv} | ${unique} | ${historicalCktV4(id)} | ${ensemble} | ${completion} |`);
  for (const row of postR11) {
    const [ref, file] = row.evidence;
    const label = markdownLink(`\`${row.label}\``, repoUrl(forge, 'benchmark', ref, file));
    rows.push(`| ${label} | ${row.stage} | ${row.domain} | ${row.mdv} | ${row.unique} | ${row.cktV4.toFixed(6)} | ${row.ensemble ?? '—'} | ${row.completion ?? '—'} |`);
  }
  return [
    generated.representatives.start,
    '',
    `现行主指标是 ${markdownLink('CKT v4', repoUrl(forge, 'benchmark', 'main', 'docs/CKT_v4_SPEC.md'))}（越低越好，S005＝10）；本表用项目评分代码从冻结结果重算 NF4—R11，并把 R11 后各层的速度极值、生产门禁方案和实战均衡点放在同一脉络中。CKT v4 与历史“补全 CKT ms”不是同一数值轴；“—”表示该探索点没有按旧指标补算。`,
    '',
    '| 方案 | 阶段／定位 | 键域 | M/D/V | U | CKT v4 ↓ | A7E-v5 / v4 / v6 ↓ | 补全 CKT ms ↓ |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    `P3/P5/P6/P8 的“速度极值”用于标记已探索地形，不等于可直接采用的生产方案；可投产性还需看人体工学门禁、重码和记忆成本。完整层级、状态规模与负结果见 ${markdownLink('R11 后探索总览', repoUrl(forge, 'benchmark', 'main', 'docs/POST_R11_EXPLORATION.md'))}。`,
    '',
    generated.representatives.end,
  ].join('\n');
}

function adoptionSection(forge) {
  const link = (label, file) => markdownLink(label, repoUrl(forge, 'rime', 'main', file));
  const evidence = (label, ref, file) => markdownLink(label, repoUrl(forge, 'benchmark', ref, file));
  return [
    generated.adoption.start,
    '',
    `截至 2026-11-01，${markdownLink('rime-snow-pinyin', repoUrl(forge, 'rime', 'main', 'README.md'))} 的当前实装分为两条：`,
    '',
    `- ${link('冰雪键道', 'snow_jiandao.schema.yaml')}与${link('冰雪三拼', 'snow_sanpin.schema.yaml')}共用 ${evidence('无飞键道(U357) 21×21 双拼', '11713b652cd6a2350d8bf6d0a16d3383d8f0038f', 'research/notes/2026-10-29-prodgate-directed-repair-final-report.md')}；运行仓库以 ${link('U357 映射夹具', 'docs/shenyun-u357-mapping.json')} 固化 \`U357-21X21-M40-D0\`。`,
    '',
    `- ${link('冰雪神韵·形', 'snow_shenyun_shape.schema.yaml')}与${link('冰雪神韵·调', 'snow_shenyun_tone.schema.yaml')}共用 ${evidence('神韵(Overall-17) 21×26 双拼', '7a7e154f3f7d0c86653ee15e755ccd72e866e5e2', 'research/milestones/strict-d0/2026-10-30-strict-d0-production-closure-report.md')}；运行仓库以 ${link('21×26 映射配置', 'config/shenyun-21x26-mapping.json')} 和${link('公共拼写代数', 'snow_shenyun_common.yaml')}固化 \`SNOW-SHENYUN-21X26-PRODUCTION\`。`,
    '',
    '以上实装文件链接跟随运行仓库的 `main`，用于查看当前采用状态；方案来源链接固定到定稿提交，便于长期复核其搜索合同和映射。',
    '',
    generated.adoption.end,
  ].join('\n');
}

function replaceSection(markdown, heading, body, trailingAnchors = []) {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const normalized = markdown.replaceAll('\r\n', '\n');
  const lines = normalized.split('\n');
  const start = lines.findIndex(line => line.trim() === heading);
  if (start < 0) throw new Error(`README 缺少章节：${heading}`);
  const end = lines.findIndex((line, index) => index > start
    && (/^##\s+/.test(line) || trailingAnchors.some(anchor => anchor.test(line))));
  const stop = end < 0 ? lines.length : end;
  const replacement = [lines[start], '', ...body.split('\n'), ''];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(stop)].join(newline);
}

function render(markdown, forge) {
  let output = replaceSection(markdown, '## 代表方案性能', representativeSection(forge));
  output = replaceSection(output, '## 实战采用', adoptionSection(forge), [/^下载：/, /^\[\^/]);
  return output.endsWith('\n') ? output : `${output}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  let changed = false;
  for (const target of targets) {
    const filename = path.join(root, target.file);
    const before = readFileSync(filename, 'utf8');
    const after = render(before, target.forge);
    if (before === after) continue;
    changed = true;
    if (!check) writeFileSync(filename, after, 'utf8');
    console.error(`${check ? '需要更新' : '已更新'} ${target.file}`);
  }
  if (check && changed) process.exitCode = 1;
  if (!changed) console.log('README 代表方案与实战采用章节已是最新。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export {render, replaceSection};
