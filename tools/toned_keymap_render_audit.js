// Check the final SVG as well as the abstract palette graph. Missing W/Y
// semantics must be an error, rather than silently removing an edge to audit.
function auditTonedKeymapSVG(source, native) {
  const entry = snowKeyboardEntry(native), doc = new DOMParser().parseFromString(source,'image/svg+xml');
  const letterKeys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  for (const names of Object.values(native.keyboards.firstByKey)) if (names.some(name=>/^[wy]$/i.test(name)))
    throw new Error(native.id + ': W/Y must be declared as zero-W/zero-Y');
  const semantics = Object.fromEntries(letterKeys.map(key=>[key,keySemantic(entry,key)]));
  const traditional = [...KEYMAP_LINK_COLOR_CONTRACT.traditionalInitials];
  const ordinaryTargets = Object.fromEntries(traditional.map(name=>[name,letterKeys.filter(key=>semantics[key].roles.some(role=>String(role).toLowerCase()===name))]));
  const ordinaryMoved = Object.fromEntries(traditional.map(name=>[name,ordinaryTargets[name].length>0&&!ordinaryTargets[name].includes(name.toUpperCase())]));
  const zeroTargets = Object.fromEntries(['W','Y'].map(name=>[name,letterKeys.filter(key=>semantics[key].roles.some(role=>String(role).replaceAll(' ','').startsWith('Ø'+name)))]));
  for (const carrier of ['W','Y']) {
    const actualTargets = [...new Set(D.pinyin.flatMap((py,index) => py.startsWith(carrier.toLowerCase()) ?
      native.tonedCodes[index].filter(Boolean).map(code=>code[0]) : []))].sort();
    if (actualTargets.join('')!==[...zeroTargets[carrier]].sort().join(''))
      throw new Error(native.id + ': missing/wrong zero-' + carrier + ' semantics compared with actual codes');
  }
  const zeroMoved = Object.fromEntries(['W','Y'].map(name=>[name,zeroTargets[name].length>0&&!zeroTargets[name].includes(name)]));
  const state = {letterKeys,semantics,ordinaryTargets,ordinaryMoved,zeroTargets,zeroMoved,isDirectOnset:directOnset};
  const colors = resolveKeymapLinkColors(state);validateKeymapLinkContrast(state,colors);
  const text = (key,label) => [...doc.querySelectorAll(`g[data-key="${key}"] > g > text`)].find(node=>node.textContent.replaceAll(' ','')===label.replaceAll(' ',''));
  const requireInk = (key,label,expected) => {
    const actual = text(key,label)?.getAttribute('fill');
    if (actual!==expected) throw new Error(`${native.id}: ${key}/${label} final SVG ink ${actual} != ${expected}`);
    return actual;
  };
  let links=0;
  for (const name of traditional.filter(name=>ordinaryMoved[name])) {
    requireInk(name.toUpperCase(),name.toUpperCase(),colors.initialLinkInk[name]);
    for (const key of ordinaryTargets[name]) requireInk(key,name,colors.initialLinkInk[name]);
    links++;
  }
  for (const name of ['W','Y'].filter(name=>zeroMoved[name])) {
    requireInk(name,name,colors.zeroLinkStyle[name].ink);
    for (const key of zeroTargets[name]) requireInk(key,'Ø'+name,colors.zeroLinkStyle[name].ink);
    links++;
  }
  return {id:native.id,links,zeroTargets,zeroMoved};
}
