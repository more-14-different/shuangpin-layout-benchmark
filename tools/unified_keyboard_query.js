'use strict';

// Query interpretation is independent of corpus selection and completion paths.
// A syllable query must never light keys belonging to its neighbours in a word.
const UnifiedKeyboardQuery = (() => {
  const normalize = value => String(value || '').trim().toLowerCase().replace(/u:|ü/g, 'v').replace(/5/g, '0');
  const isHanzi = value => /^\p{Script=Han}+$/u.test(String(value || '').trim());
  const readingTokens = reading => normalize(reading).split(/[\s'’·-]+/).filter(Boolean).map(token => {
    const match = /^([a-zv]+)([0-4])?$/.exec(token);
    return match ? {syllable: match[1], tone: match[2] == null ? null : Number(match[2]) || 5} : null;
  }).filter(Boolean);

  function parsePinyin(pinyin, query, codeFor) {
    const normalized = normalize(query), chunks = normalized.split(/[\s'’·-]+/).filter(Boolean);
    if (!chunks.length || !chunks.every(chunk => /^[a-zv0-4]+$/.test(chunk))) return null;
    const parts = [], keys = new Set();
    for (const chunk of chunks) {
      const memo = new Map([[chunk.length, {count: 0, edges: []}]]);
      function visit(at) {
        if (memo.has(at)) return memo.get(at);
        let count = Infinity, edges = [];
        for (let py = 0; py < pinyin.length; py++) {
          const syllable = pinyin[py];
          if (!chunk.startsWith(syllable, at)) continue;
          let end = at + syllable.length, tone = null;
          if (/[0-4]/.test(chunk[end] || '!')) {tone = Number(chunk[end]) || 5;end++}
          const codes = (tone == null ? [1, 2, 3, 4, 5] : [tone]).map(t => codeFor(py, t)).filter(Boolean);
          if (!codes.length) continue;
          const tail = visit(end);
          if (!tail || tail.count + 1 > count) continue;
          if (tail.count + 1 < count) {count = tail.count + 1;edges = []}
          edges.push({syllable, tone, codes, tail});
        }
        const node = Number.isFinite(count) ? {count, edges} : null;
        memo.set(at, node);return node;
      }
      const root = visit(0);
      if (!root) return null;
      parts.push(root);
      const seen = new Set();
      function collect(node) {
        if (seen.has(node)) return;
        seen.add(node);
        for (const edge of node.edges) {for (const code of edge.codes) for (const key of code) keys.add(key);collect(edge.tail)}
      }
      collect(root);
    }
    return {parts, keys, count: parts.reduce((sum, part) => sum + part.count, 0)};
  }

  function matchesReading(parsed, reading) {
    const tokens = readingTokens(reading);
    if (!parsed || parsed.count !== tokens.length) return false;
    let offset = 0;
    for (const part of parsed.parts) {
      function matches(node, at) {
        if (!node.count) return true;
        const token = tokens[at];
        return !!token && node.edges.some(edge => token.syllable === edge.syllable &&
          (edge.tone == null || token.tone == null || edge.tone === token.tone) && matches(edge.tail, at + 1));
      }
      if (!matches(part, offset)) return false;
      offset += part.count;
    }
    return true;
  }

  function hanziKeys(query, characters, codeFor, exactRows = [], mainCode = row => row[2]) {
    const keys = new Set();
    if (exactRows.length) {
      for (const row of exactRows) for (const key of mainCode(row) || '') keys.add(key);
      return keys;
    }
    for (const char of String(query).trim()) {
      const readings = characters.filter(row => row[0] === char).map(row => codeFor(row[1], row[2])).filter(Boolean);
      if (!readings.length) return new Set();
      for (const code of readings) for (const key of code) keys.add(key);
    }
    return keys;
  }

  return {normalize, isHanzi, readingTokens, parsePinyin, matchesReading, hanziKeys};
})();

if (typeof module !== 'undefined') module.exports = UnifiedKeyboardQuery;
