import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const artifact = fileURLToPath(new URL('../a7_CKT_R11.html', import.meta.url));
const artifactAvailable = existsSync(artifact);
const html = artifactAvailable ? readFileSync(artifact, 'utf8') : '';
const artifactTest = artifactAvailable ? test : test.skip;

artifactTest('the inherited NF3 selection remains the default scheme', () => {
  assert.equal((html.match(/CURRENT=D\.entries\.some\(e=>e\.id==='NF3-21X21-M40-44'\)\?'NF3-21X21-M40-44':D\.entries\[0\]\.id/g) ?? []).length, 2);
});

artifactTest('top-level pages declare their own control zones', () => {
  assert.match(html, /const NF6_PAGE_CONTROLS\s*=\s*\{/);
  assert.match(html, /benchmark:\s*\['uxFilters','uxEnvironment','uxMarking'\]/);
  assert.match(html, /selection:\s*\['nf6SelectionFilters'\]/);
  assert.match(html, /scheme:\s*\['nf6SchemePicker','uxEnvironment'\]/);
  assert.match(html, /visualLegend:\s*\[\]/);
  assert.match(html, /matrix:\s*\['nf6MatrixControls'\]/);
});

artifactTest('selection overview uses only orthogonal selection dimensions', () => {
  assert.match(html, /function nf6SelectionEntries\(/);
  for (const dimension of ['hostDomain', 'auxSet', 'auxMap', 'logicTemplate', 'memoryMax']) {
    assert.match(html, new RegExp(`selection\\.${dimension}`));
  }
  assert.doesNotMatch(html, /id="nf6SelectionScheme"/);
});

artifactTest('scheme detail has a typing filter and a linked single-selection list', () => {
  assert.match(html, /id="nf6SchemeQuery"/);
  assert.match(html, /id="nf6SchemeList"[^>]*size=/);
  assert.match(html, /function nf6SchemeEntries\(/);
  assert.match(html, /function nf6RenderSchemeList\(/);
  assert.match(html, /更新详情/);
});

artifactTest('key-pair slice exposes only the model and conditional scenario', () => {
  assert.match(html, /id="nf6MatrixModel"/);
  assert.match(html, /id="nf6MatrixScenario"/);
  assert.match(html, /function nf6ApplyMatrixContext\(/);
  assert.match(html, /nf6MatrixScenario[^\n]+scenario/);
  assert.match(html, /sub\.after\(matrix\)/);
});

artifactTest('page-specific controls reuse the matching benchmark semantic colors', () => {
  assert.match(html, /--nf6-selection-bg:var\(--ux-filter\)/);
  assert.match(html, /\.nf6-mark-controls\{background:var\(--ux-mark\)/);
  assert.match(html, /--nf6-matrix-bg:var\(--ux-env\)/);
});

artifactTest('selection overview does not special-case the historical S005 pair', () => {
  const overviewOverride = html.match(/uxRenderOverview=function\(\)\{NF3_OV_BASE\(\);[^\n]+/)?.[0] ?? '';
  assert.doesNotMatch(overviewOverride, /s005ComparisonCard/);
});

artifactTest('selection preference card has the approved aligned and dynamic layout', () => {
  assert.match(html, /nf6-preference-card/);
  assert.match(html, /nf6-pref-line/);
  assert.match(html, /nf6-ribbon-line/);
  assert.match(html, /nf6-filter-live/);
  assert.match(html, /nf6-mark-live/);
  assert.match(html, /--nf6-pref-bg:#e6f4f2/);
  assert.match(html, /\.nf6-pref-line[^}]*align-items:center/);
  assert.match(html, /\.nf6-ribbon-line[^}]*align-items:center/);
  assert.match(html, /\.nf6-preference-card>\.dv-ribbon[^}]*border-top:0/);
  assert.match(html, /\.nf6-preference-card>\.dv-ribbon[^}]*border-bottom:0/);
});

artifactTest('benchmark removes only explicitly low-information result columns', () => {
  assert.match(html, /function uxCompactColumns\(headers,rows,raws=\[\]\)/);
  assert.match(html, /keyGuardMs:\{hideWhen:'allZero'\}/);
  assert.match(html, /lengthGuardMs:\{hideWhen:'allZero'\}/);
  assert.match(html, /extrapolatedCodeShare:\{hideWhen:'allZero'\}/);
  assert.match(html, /longCodeShare:\{hideWhen:'allZero'\}/);
  assert.match(html, /centerMs:\{hideWhen:'duplicate',compareTo:'eq'\}/);
  assert.match(html, /perChar:\{hideWhen:'duplicate',compareTo:'eq'\}/);
  assert.match(html, /n:\{hideWhen:'uniform'\}/);
  assert.match(html, /meanKeys:\{hideWhen:'uniform'\}/);
  assert.match(html, /uxTable\(compact\.headers,compact\.rows,ids,'benchmark',compact\.raws\)/);
  assert.match(html, /label:'宿主键域',help:'domain',column:'domain',hideWhen:'uniform'/);
  assert.match(html, /label:'五辅键方向',help:'aux',column:'aux',hideWhen:'uniform'/);
  assert.match(html, /uxTable\(compact\.headers,compact\.rows,es\.map\(e=>e\.id\),'fair',compact\.raws\)/);
  assert.match(html, /已收起无比较信息的列/);
});
