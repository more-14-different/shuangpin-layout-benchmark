'use strict';

// LU-v1r / FA-1 definitions, extended by conditioning the rhyme component on
// the actual tone. No layout-specific template or fitted weight is added.
const RULE_INITIALS = ['zh', 'ch', 'sh', ...'bpmfdtnlgkhjqxrzcs'];
const RULE_YW = {yi:'i',ya:'ia',yao:'iao',ye:'ie',you:'iou',yan:'ian',yin:'in',yang:'iang',ying:'ing',yong:'iong',yo:'io',yu:'v',yue:'ve',yuan:'van',yun:'vn',wu:'u',wa:'ua',wai:'uai',wei:'uei',wan:'uan',wen:'uen',wang:'uang',weng:'ueng',wo:'uo'};
const norm = p => p.replaceAll('ü', 'v').replaceAll('ê', 'e');
function written(p) {p = norm(p);const initial = [...RULE_INITIALS, 'y', 'w'].find(i => p.startsWith(i)) || '';return [initial || 'Ø', p.slice(initial.length) || p]}
function restored(p) {
  p = norm(p);p = ({m:'em',n:'en',ng:'eng',hng:'heng'})[p] || p;p = RULE_YW[p] || p;
  const initial = RULE_INITIALS.find(i => p.startsWith(i)) || '';
  let rhyme = p.slice(initial.length);
  if (['j','q','x'].includes(initial) && rhyme.startsWith('u')) rhyme = 'v' + rhyme.slice(1);
  rhyme = ({ui:'uei',iu:'iou',un:'uen'})[rhyme] || rhyme;
  const medial = 'iuv'.includes(rhyme[0]) ? rhyme[0] : '';
  return {initial, rhyme, medial, carrier: initial || 'Ø' + (medial || 'a')};
}
function sipRhyme(rhyme) {
  rhyme = rhyme.replaceAll('ao', 'au');
  for (const [before, after] of [['ia','u'],['ua','i'],['va','o'],['ie','e'],['ue','u'],['ve','o'],['io','o'],['uo','o'],['er','i'],['v','a']]) {
    if (rhyme.startsWith(before)) {rhyme = after + rhyme.slice(before.length);break}
  }
  let tail = '';
  for (const [before, after] of [['ng','e'],['n','o'],['m','a']]) if (rhyme.endsWith(before)) {rhyme = rhyme.slice(0, -before.length);tail = after;break}
  return rhyme + (tail ? '/' + tail : '');
}

function toneRuleMetrics(data, soundRows) {
  const support = new Map();
  for (const block of data.logicUniformity.supportPartitions) for (const group of block.groups) for (const a of group) for (const b of group) {
    if (a !== b) {const key = [a,b].sort().join('|');support.set(key, Math.max(support.get(key) || 0, block.weight))}
  }
  const templates = {
    written,
    writtenZero: p => {const [i,r] = written(p);return [i === 'Ø' ? 'Ø' + ('aeo'.includes(p[0]) ? p[0] : '') : i,r]},
    restored: p => {const r = restored(p);return [r.carrier,r.rhyme]},
    shengjie: p => {const r = restored(p);return [(r.initial || 'Ø') + (r.medial ? ':' + r.medial : ''), (r.medial ? r.rhyme.slice(1) : r.rhyme) || '∅']},
    sipin: p => {const r = restored(p);return [['zh','ch','sh'].includes(r.initial) ? 'S:' + r.initial : r.initial || 'Ø:' + (r.medial || 'a'),sipRhyme(r.rhyme)]},
  };
  function affinity(template, side, left, right) {
    if (side === 1) {
      const a = left.split('@')[0], b = right.split('@')[0];
      if (a === b) return 1; // Different tones intentionally share a region.
      if (['restored','written','writtenZero'].includes(template)) return support.get([norm(a),norm(b)].sort().join('|')) || 0;
      if (template === 'shengjie') return a.replace(/[ng]+$/, '') === b.replace(/[ng]+$/, '') ? .65 : [a,b].includes('∅') ? .15 : 0;
      const x = a.split('/'), y = b.split('/');return x[0] === y[0] || x.length > 1 && y.length > 1 && x[1] === y[1] ? .65 : 0;
    }
    const a = left.split(':')[0], b = right.split(':')[0];
    if (a === b) return 1;
    if (left.startsWith('Ø') && right.startsWith('Ø')) return .72;
    if ([a,b].includes('Ø') && [a,b].some(i => ['r','f','s','k'].includes(i))) return .85;
    if (left.startsWith('Ø') || right.startsWith('Ø')) return .28;
    return ['zh','ch','sh'].includes(a) && ['zh','ch','sh'].includes(b) ? .25 : 0;
  }
  const results = [];
  for (const [template, split] of Object.entries(templates)) {
    const tokens = soundRows.map(row => {const pair = split(data.pinyin[row.py]);return [pair[0], pair[1] + '@' + row.tone]});
    const consistency = [], regularity = [];
    for (const side of [0,1]) {
      const observations = new Map(), byKey = new Map(), frequency = new Map();
      let total = 0;
      for (let at = 0; at < soundRows.length; at++) {
        const {code,w} = soundRows[at], token = tokens[at][side], key = code[side];
        const counts = observations.get(token) || new Map();counts.set(key, (counts.get(key) || 0) + w);observations.set(token, counts);
        const labels = byKey.get(key) || new Set();labels.add(token);byKey.set(key, labels);
        frequency.set(token, (frequency.get(token) || 0) + w);total += w;
      }
      consistency.push([...observations.values()].reduce((sum, counts) => sum + Math.max(...counts.values()), 0) / total);
      let numerator = 0, denominator = 0;
      for (const labels of byKey.values()) {
        const items = [...labels];
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const weight = Math.sqrt(frequency.get(items[i]) * frequency.get(items[j]));
          denominator += weight;numerator += weight * affinity(template, side, items[i], items[j]);
        }
      }
      regularity.push(denominator ? numerator / denominator : 1);
    }
    const factorization = (consistency[0] + consistency[1]) / 2;
    results.push({template, firstConsistency: consistency[0], secondConsistency: consistency[1], factorization,
      rhymeRuleSupport: regularity[1], onsetRegularity: regularity[0],
      score: 100 * (.55 * factorization + .30 * regularity[1] + .15 * regularity[0])});
  }
  const lu = [...results].sort((a,b) => b.score - a.score)[0];
  const fa = results.filter(r => r.template !== 'sipin').sort((a,b) => b.factorization - a.factorization)[0];
  const vowelClass = pinyin => {
    const [initial, rhyme] = written(pinyin);
    return ['j','q','x','y'].includes(initial) && rhyme.startsWith('u') ? 'v' + rhyme.slice(1) : rhyme;
  };
  const vowels = [...'aeiou'].map(vowel => ({vowel, keys: [...new Set(soundRows.filter(row => vowelClass(data.pinyin[row.py]) === vowel).map(row => row.code[1]))]}));
  return {lu, fa: {score: 100 * fa.factorization, template: fa.template}, alternatives: results,
    V: vowels.filter(row => row.keys.length && row.keys.some(key => key !== row.vowel.toUpperCase())).length, vowels,
    definition: 'LU-v1r weights/support and FA-1 templates unchanged; second component conditioned on tone; V counts ordinary vowel categories displaced in any legal tone'};
}
module.exports = {toneRuleMetrics};
