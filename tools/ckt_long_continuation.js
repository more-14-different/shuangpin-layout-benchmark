'use strict';

// Opt-in research model. Historical CKT scoring and its defaults stay in ckt_v4_model.
const crypto = require('node:crypto');
const {upstreamMotor} = require('./ckt_v4_model');

function snapshotFingerprint(snapshot) {
  const hash = crypto.createHash('sha256').update(snapshot.keys+'\0'+snapshot.commit+'\0');
  for (const role of snapshot.roles) {
    hash.update(role+'\0').update(Buffer.from(snapshot.tables[role].base64, 'base64'));
  }
  return hash.digest('hex');
}

function positionAwareMotor(snapshot, profile, options) {
  const scale = options?.positionScale;
  if (!Number.isFinite(scale) || scale < 0 || scale > 1) {
    throw new Error('positionScale must be explicitly specified in [0,1]');
  }
  const monotone = options.monotone ?? true;
  if (typeof monotone !== 'boolean') throw new Error('monotone must be boolean');
  if (profile.version !== 'ckt-long-error-profile-v1' || profile.keys !== snapshot.keys ||
      profile.snapshotFingerprint !== snapshotFingerprint(snapshot) ||
      profile.errorRecoveryMs !== snapshot.errorRecoveryMs) {
    throw new Error('error profile does not match the frozen motor snapshot');
  }
  if (!Number.isFinite(profile.positionDelta) || profile.positionDelta < 0) {
    throw new Error('positionDelta must be finite and nonnegative');
  }
  const size = snapshot.keys.length;
  const index = Object.fromEntries([...snapshot.keys].map((key,i) => [key,i]));
  const errors = {};
  for (const [role, dimensions] of [['L4i2',4], ['L4i3',3]]) {
    const table = profile.errorTables[role];
    const bytes = Buffer.from(table.base64, 'base64');
    if (bytes.length !== 4*size**dimensions || table.shape.length !== dimensions ||
        table.shape.some(n => n !== size)) throw new Error('invalid error table '+role);
    const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    if (values.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw new Error('invalid probability '+role);
    errors[role] = values;
  }
  const legacy = upstreamMotor(snapshot), cache = new Map();
  const cacheLimit = options.cacheLimit ?? 50000;
  if (!Number.isInteger(cacheLimit) || cacheLimit < 0) throw new Error('invalid cacheLimit');
  function probability(role, code) {
    let at = 0;
    for (const key of code) at = at*size+index[key];
    return errors[role][at];
  }
  function evaluate(code) {
    if (cache.has(code)) return cache.get(code);
    if (code.length > 6) throw new Error('research continuation supports at most six keys');
    const base = legacy(code);
    if (!base || code.length <= 4) return base;
    let positionErrorCorrectionMs = 0;
    for (let i = 2; i < code.length; i++) {
      const last = i === code.length-1;
      const offset = i-(last ? 3 : 2);
      if (offset <= 0 || scale === 0) continue;
      const p = probability(last ? 'L4i3' : 'L4i2', code.slice(i-2,last ? i+1 : i+2));
      // Equivalent to sigmoid(logit(p)+shift), with exact p=0/1 boundaries.
      const corrected = p === 0 || p === 1 ? p : p/(p+(1-p)*Math.exp(-scale*profile.positionDelta*offset));
      positionErrorCorrectionMs += profile.errorRecoveryMs*(corrected-p);
    }
    const rawUpperMs = base.upperMs+positionErrorCorrectionMs;
    const prefixUpperMs = monotone ? evaluate(code.slice(0,-1)).upperMs : null;
    const monotoneCorrectionMs = monotone ? Math.max(0,prefixUpperMs-rawUpperMs) : 0;
    const value = {...base, upperMs:rawUpperMs+monotoneCorrectionMs,
      legacyUpperMs:base.upperMs, positionErrorCorrectionMs, rawUpperMs, monotoneCorrectionMs,
      continuationModel:'position-error-v1', positionScale:scale, monotone};
    if (cacheLimit) {
      if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
      cache.set(code,value);
    }
    return value;
  }
  return evaluate;
}

module.exports = {snapshotFingerprint, positionAwareMotor};
