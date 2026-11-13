// Injected after the selectable contract bridge by its Python integrator.
function snowJiandaoKeyboardSVG(mode = 'semantic', load = null, native = snowJiandaoNative() || snowJiandaoNative(SNOW_JIANDAO_TONED_ID)) {
  const entry = snowKeyboardEntry(native), heat = mode !== 'semantic';
  const rhymeNames = native.publication?.rhymeGroups?.map(group => group.roots.join('-'));
  const rhymeColors = rhymeNames ? Object.fromEntries(rhymeNames.map((name, index) => [name, Object.values(SNOW_RHYME_COLORS)[index]])) : SNOW_RHYME_COLORS;
  if (heat && !load) {
    if (mode === 'daily') {
      const macro = native.macro['daily|native-punctuation'];
      load = Object.fromEntries(Object.entries(macro.heat_map).map(([key, value]) => [key.toUpperCase(), value / macro.hits]));
    } else load = snowRowsLoad(snowFilteredRows(native, '', mode === 'overall' ? 'all' : mode));
  }
  const loads = heat ? [...D.reference.keys].map(key => load?.[key] || 0) : null;
  const doc = new DOMParser().parseFromString(keyboardSVG(entry, loads, nf4ReadFonts(heat ? 'load' : 'semantic')), 'image/svg+xml');
  const svg = doc.documentElement;
  svg.setAttribute('aria-label', native.name + ' · ' + (mode === 'semantic' ? '声韵形辅合并键盘图' : ({overall: '总热力图', daily: '日常热力图', character: '单字热力图', word2: '二字词热力图', word3: '三字词热力图', word4: '四字词热力图'})[mode]));
  function add(parent, tag, attrs, content) {
    const element = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    if (content !== undefined) element.textContent = content;
    parent.append(element);return element;
  }
  for (const group of svg.querySelectorAll('g[data-key]')) {
    const key = group.getAttribute('data-key'), base = group.querySelector(':scope > rect');
    if (!base) continue;
    const x = Number(base.getAttribute('x')), y = Number(base.getAttribute('y'));
    const tones = [...new Set(Object.values(entry.rhymeTonesByKey[key] || {}).join(''))].sort().join('');
    const content = group.querySelector(':scope > g');
    if (!content) continue;
    if (!heat && tones) base.setAttribute('fill', SNOW_TONE_FILLS[tones]);
    if (native.keyboards.shapeByKey[key]?.length && !(entry.roles[key]?.length || entry.rhymes[key]?.length)) {
      // The tone-in-main contract has no independent auxiliary tone layer.
      if (!heat) base.setAttribute('fill', SNOW_SHAPE_PALETTE.keyFill);
      base.setAttribute('stroke', SNOW_SHAPE_PALETTE.stroke);
      for (const child of [...content.children]) {
        if (child.tagName !== 'text' || child.textContent !== key) child.remove();
      }
      add(content, 'rect', {x: x + 17, y: y + 39, width: 58, height: 64, rx: 10, fill: SNOW_SHAPE_PALETTE.badgeFill, stroke: SNOW_SHAPE_PALETTE.stroke});
      const meaning = native.keyboards.shapeByKey[key][0];
      add(content, 'text', {x: x + 46, y: y + 65, 'text-anchor': 'middle', 'font-size': 15, fill: SNOW_SHAPE_PALETTE.ink, 'font-weight': 750}, meaning);
      add(content, 'text', {x: x + 46, y: y + 89, 'text-anchor': 'middle', 'font-size': 20, fill: SNOW_SHAPE_PALETTE.ink}, {折: '㇕', 横: '一', 撇: '丿', 竖: '丨', 点: '丶'}[meaning]);
      if (heat) add(content, 'text', {x: x + 84, y: y + 20, 'text-anchor': 'end', 'font-size': 9, fill: SNOW_SHAPE_PALETTE.ink}, pct(load?.[key] || 0));
    }
    if (native.keyboards.shapeByKey[key]?.length && (entry.roles[key]?.length || entry.rhymes[key]?.length)) {
      // Replace the ordinary independent tone/shape badge at the top corner.
      // Embedded-tone schemes only need a shape label here.
      for (const node of [...content.children]) {
        if (node.tagName === 'rect' && Number(node.getAttribute('y')) === y+5 ||
            node.tagName === 'text' && Number(node.getAttribute('y')) === y+19) node.remove();
      }
      add(content,'rect',{x:x+40,y:y+5,width:47,height:21,rx:6,fill:SNOW_SHAPE_PALETTE.badgeFill,stroke:SNOW_SHAPE_PALETTE.stroke});
      add(content, 'text', {x:x+63.5,y:y+19,'text-anchor':'middle','font-size':9,fill:SNOW_SHAPE_PALETTE.ink,'data-shape':true}, '形辅·'+native.keyboards.shapeByKey[key].join('/'));
    }
    for (const rhyme of entry.rhymes[key] || []) {
      const text = [...content.querySelectorAll('text')].find(node => node.textContent === label(rhyme));
      if (!text) continue;
      text.setAttribute('data-rhyme', rhyme);
      text.setAttribute('fill', rhymeColors[rhyme]);
      // A pale backing preserves rhyme identity over dark heat cells.
      if (heat) {
        const fz = Number(text.getAttribute('font-size')), baseline = Number(text.getAttribute('y'));
        const width = Math.min(84, Math.max(24, label(rhyme).length * fz * .56 + 8));
        const backing = add(content, 'rect', {x: x + 46 - width / 2, y: baseline - fz, width, height: fz + 4, rx: 3, fill: '#fffdf8', 'fill-opacity': .92});
        content.insertBefore(backing, text);
      }
    }
    if (tones) add(content, 'text', {x: x + 84, y: y + (heat || native.keyboards.shapeByKey[key]?.length ? 37 : 20), 'text-anchor': 'end', 'font-size': 11, fill: '#516068', 'data-tones': tones}, tones === '01' ? '1/0' : tones.split('').join('/'));
    group.querySelector('title').textContent = `${key}｜声母 ${entry.roles[key]?.join(' / ') || '—'}｜${Object.entries(entry.rhymeTonesByKey[key] || {}).map(([name, digits]) => name + '·' + digits).join(' / ') || '—'}${native.keyboards.shapeByKey[key]?.length ? '｜纯形辅 ' + native.keyboards.shapeByKey[key].join('/') : ''}${heat ? '｜负担 ' + pct(load?.[key] || 0) : ''}`;
  }
  const captions = svg.querySelectorAll(':scope > text');
  captions[1].textContent = '声母 / 零声母 / 十韵组 / 纯形辅 · 声调 01234（0＝轻声）';
  const toneRows = native.publication?.toneRowsByTone || {1:2,2:1,3:1,4:0,5:2};
  captions[2].textContent = ['上排','中排','下排'].map((name,r)=>name+' '+[1,2,3,4,5].filter(t=>toneRows[t]===r).map(t=>t===5?0:t).join('/')+' 声').join(' · ')+'；同韵组同文字色。';
  captions[3].textContent = '形辅 '+native.contract.shapeKeysByMeaning+'（折横撇竖点）；与声韵共键时保留全部角色；声母位移 link 使用统一配色。';
  add(svg, 'style', {}, '.nf5-dim{opacity:.16}');
  return new XMLSerializer().serializeToString(svg);
}

function snowJiandaoFilterState() {
  const native = snowJiandaoNative();
  const mode = $('#snowJiandaoKeyboardMode')?.value || 'semantic', query = $('#nf5Query')?.value || '';
  const kind = ['semantic', 'overall', 'daily'].includes(mode) ? 'all' : mode;
  const rows = snowFilteredRows(native, query, kind, D.pinyin);
  const queryKeys = query.trim() ? snowQueryKeys(native, D, query, rows) : new Set();
  const preview = !rows.length && queryKeys.size ? [{keys: [...queryKeys]}] : [];
  return {mode, query, rows, preview, queryKeys};
}

function snowJiandaoDrawKeyboard() {
  const state = snowJiandaoFilterState(), {mode, query, rows, preview, queryKeys} = state;
  let load = null;
  if (query.trim() || mode !== 'daily') load = snowRowsLoad(rows, mode === 'daily');
  $('#svgbox').innerHTML = snowJiandaoKeyboardSVG(mode, load);
  const relevant = mode === 'semantic' || !rows.length ? queryKeys : new Set(rows.flatMap(row => [...row[mode === 'daily' ? 2 : 3]]));
  if (query.trim()) for (const group of $('#svgbox').querySelectorAll('g[data-key]')) {
    const active = relevant.has(group.getAttribute('data-key'));
    group.classList.toggle('nf5-dim', !active);group.setAttribute('data-active', String(active));
    if (active) {
      const base = group.querySelector(':scope > rect');
      base?.setAttribute('stroke', '#53675b');base?.setAttribute('stroke-width', '3.5');
    }
  }
  $('#nf5FilterSummary').textContent = `当前筛选 ${rows.length.toLocaleString('zh-CN')} 项；${!rows.length && preview.length ? '语料未命中，显示合法拼音／逐字主码预览（无频率，不计入热力）。' : query.trim() && !rows.length ? '无匹配，所有键已淡化。' : '明细按完整字词／音节匹配，热力仅统计匹配语料。'}${query.trim() ? ' 声韵图只激活查询本身的主码；全拼未指定声调时合并所有合法声调，指定 01234 时按调取码。' : ''}${mode === 'overall' ? ' 总热力图按字／二字／三字／四字轨 1:3:1:1 混合，各轨先按击键归一；筛选后对非空轨重新归一。' : ''}${mode === 'daily' ? query.trim() ? ' 当前为筛选字词主码负担；清空后恢复日常文章回放。' : ' 日常图采用冻结文章回放，含标点。' : ''}`;
  const shown = rows.slice(0, 120);
  $('#snowJiandaoFilteredData').innerHTML = `<p class="hint">显示前 ${shown.length} / ${rows.length} 项；声调数字 0 代表轻声。终码包含实际选用的形辅。</p><div class="scroll">${table(['字词', '全拼声调', '主码', '终码', '频率', '轨'], shown.map(row => row.map((value, index) => esc(index === 5 ? ({character: '单字', word2: '二字', word3: '三字', word4: '四字'})[value] : value))))}</div>`;
}

function snowJiandaoKeyboardPanel() {
  return `<section class="card snow-jiandao-keyboards"><style>
  .snow-jiandao-keyboards .nf5-shared-tools{grid-template-columns:minmax(200px,auto) minmax(220px,1fr) auto auto}
  @media(max-width:1050px){.snow-jiandao-keyboards .nf5-shared-tools{grid-template-columns:1fr 1fr}}
  @media(max-width:650px){.snow-jiandao-keyboards .nf5-shared-tools{grid-template-columns:1fr}}
  </style><div class="heading"><h3>${esc(snowJiandaoNative().name)}键盘图</h3></div>
  ${nf4TypeTools('keyboard').replaceAll('data-nf4-action', 'data-snow-export')}
  <div class="nf5-shared-tools"><label class="control"><span>键盘图</span><select id="snowJiandaoKeyboardMode"><option value="semantic">声韵形辅合并键盘图</option><option value="overall">总热力图 · 字词 1:3:1:1</option><option value="daily">日常文章热力图</option><option value="character">单字热力图</option><option value="word2">二字词热力图</option><option value="word3">三字词热力图</option><option value="word4">四字词热力图</option></select></label><label class="control nf5-query"><span>统一筛选</span><input id="nf5Query" placeholder="全拼、汉字、词语；如 jian4dao1 / jiandao" autocomplete="off"></label><button id="nf5Reset" type="button">清空筛选</button><button id="snowJiandaoExportRows" type="button">导出筛选 TSV</button></div>
  <p id="nf5FilterSummary" class="nf5-filter-summary" aria-live="polite"></p><div id="svgbox"></div>
  <div class="kbdlegend">${keymapLinkLegendHtml()}<p>语义图底色：蓝＝4 声，绿＝2/3 声，黄＝1/0 声，淡紫＝独立形辅；形辅键 ${esc(snowJiandaoNative().contract.shapeKeysByMeaning)}。热力图按负担着色，韵组颜色跨排一致。</p></div>
  <div class="nf5-data-section"><h3>筛选明细</h3><div id="snowJiandaoFilteredData"></div></div></section>`;
}

function snowJiandaoWireKeyboard() {
  $('#snowJiandaoKeyboardMode').onchange = snowJiandaoDrawKeyboard;
  $('#nf5Query').oninput = snowJiandaoDrawKeyboard;
  $('#nf5Reset').onclick = () => {$('#nf5Query').value = '';snowJiandaoDrawKeyboard()};
  $('#snowJiandaoExportRows').onclick = () => {
    const rows = snowJiandaoFilterState().rows;
    download(snowJiandaoNative().id + '_filtered.tsv', ['字词\t全拼声调\t主码\t终码\t频率\t轨', ...rows.map(row => row.join('\t'))].join('\n'), 'text/tab-separated-values;charset=utf-8');
  };
  for (const button of document.querySelectorAll('[data-snow-export]')) button.onclick = () => {
    const mode = $('#snowJiandaoKeyboardMode').value, name = snowJiandaoNative().id + '_' + mode;
    const svg = $('#svgbox').innerHTML;
    if (button.dataset.snowExport === 'svg') {download(name + '.svg', svg, 'image/svg+xml');return}
    const css = [...document.querySelectorAll('head style')].map(style => style.textContent).join('\n');
    const legend = $('.snow-jiandao-keyboards .kbdlegend').outerHTML;
    const note = $('#nf5FilterSummary').textContent, query = $('#nf5Query').value;
    const data = $('#snowJiandaoFilteredData').innerHTML;
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>${css}body{padding:24px}.keysvg{width:100%;height:auto}main{max-width:1380px;margin:auto}</style></head><body><main><h1>${esc(name)}</h1><p>统一筛选：${esc(query || '全部')}</p><p>${esc(note)}</p>${svg}${legend}<h2>筛选明细</h2>${data}</main></body></html>`;
    download(name + '_scheme_detail.html', html, 'text/html;charset=utf-8');
  };
  nf4WireTypeTools(snowJiandaoDrawKeyboard);snowJiandaoDrawKeyboard();
}
