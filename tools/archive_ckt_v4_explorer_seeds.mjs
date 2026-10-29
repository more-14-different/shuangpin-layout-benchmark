import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${flag ?? '<end>'}`);
    result[flag.slice(2)] = value;
  }
  return result;
}

function portable(value) {
  return path.normalize(value).replaceAll('\\', '/');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const args = parseArgs(process.argv.slice(2));
for (const name of ['plan', 'ranking', 'output']) {
  if (!args[name]) throw new Error(`--${name} is required`);
}
const plan = JSON.parse(fs.readFileSync(args.plan, 'utf8'));
if (!Array.isArray(plan.seeds) || plan.seeds.length === 0) throw new Error('plan contains no seeds');
const capacities = new Set(plan.seeds.map(seed => seed.point.layout.capacity.join(',')));
if (capacities.size !== 1) throw new Error('plan seeds do not share one capacity');
const ranking = JSON.parse(fs.readFileSync(args.ranking, 'utf8'));
if (ranking.version !== 'ckt-v4-ranked-explorer-seeds-1') {
  throw new Error(`unsupported ranking version ${ranking.version}`);
}
const capacity = [...capacities][0].split(',').map(Number);
if (capacity.join(',') !== ranking.capacity.join(',')) throw new Error('plan/ranking capacity differs');

const planDirectory = path.dirname(args.plan);
const available = fs.readdirSync(planDirectory);
fs.mkdirSync(args.output, {recursive: true});
const archived = plan.seeds.map(seed => {
  const prefix = `seed-${String(seed.rank).padStart(2, '0')}-`;
  const matches = available.filter(name => name.startsWith(prefix) && name.endsWith('.json'));
  if (matches.length !== 1) throw new Error(`expected one ${prefix}*.json file, found ${matches.length}`);
  const reason = seed.reason.replaceAll(/[^a-z0-9-]+/gi, '-');
  const filename = `seed-${String(seed.rank).padStart(2, '0')}-${reason}.json`;
  const source = path.join(planDirectory, matches[0]);
  const layout = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (JSON.stringify(layout) !== JSON.stringify(seed.point.layout)) {
    throw new Error(`${matches[0]} does not match its plan layout`);
  }
  fs.copyFileSync(source, path.join(args.output, filename));
  return {
    rank: seed.rank,
    reason: seed.reason,
    stateKey: seed.stateKey,
    filename,
    originId: seed.point.layout.id,
    iteration: seed.point.iteration,
    metrics: seed.point.metrics,
    nearestPriorDistance: seed.nearestPriorDistance,
    nearestPriorDistanceExact: seed.nearestPriorDistanceExact,
    coverageCell: seed.coverageCell,
    coverageCount: seed.coverageCount,
  };
});

// Patch audit gap: also archive the global bestCktV4 layout from database
let globalBest = null;
const dbCandidate = args.db ?? path.join(planDirectory, '../exploration.sqlite3');
if (fs.existsSync(dbCandidate)) {
  try {
    const stdout = execFileSync('sqlite3', [
      dbCandidate,
      'SELECT hex(state_key), layout_id, ckt_v4, memory, displaced_initials, displaced_vowels, ergonomics_json FROM states ORDER BY ckt_v4 ASC LIMIT 1;'
    ], { encoding: 'utf8' }).trim();
    if (stdout) {
      const [hexKey, layoutId, cktStr, memStr, dStr, vStr, ergoStr] = stdout.split('|');
      const buf = Buffer.from(hexKey, 'hex');
      if (buf.length === 69) {
        const cap = [buf[0], buf[1]];
        const headKeys = Array.from(buf.slice(2, 29));
        const finalKeys = Array.from(buf.slice(29, 64));
        const tone = Array.from(buf.slice(64, 69));
        const globalBestLayout = {
          id: `${layoutId}-global-best`,
          capacity: cap,
          headKeys,
          finalKeys,
          tone,
        };
        const bestFilename = 'best-global-ckt-v4.json';
        fs.writeFileSync(path.join(args.output, bestFilename), `${JSON.stringify(globalBestLayout, null, 2)}\n`);
        let ergo = null;
        try { if (ergoStr) ergo = JSON.parse(ergoStr); } catch (_) {}
        globalBest = {
          stateKey: hexKey,
          filename: bestFilename,
          originId: layoutId,
          metrics: {
            cktV4: parseFloat(cktStr),
            memory: parseInt(memStr, 10),
            displacedInitials: parseInt(dStr, 10),
            displacedVowels: parseInt(vStr, 10),
            ergonomics: ergo,
          },
        };
      }
    }
  } catch (err) {
    console.warn(`[archive] warning: unable to extract global best layout: ${err.message}`);
  }
}

const manifest = {
  version: 'ckt-v4-seed-archive-1',
  capacity,
  generation: plan.generation,
  bestCktV4: plan.bestCktV4,
  totalStates: plan.totalStates,
  sources: {
    plan: portable(args.plan),
    planSha256: sha256(args.plan),
    initialRanking: portable(args.ranking),
    initialRankingSha256: sha256(args.ranking),
  },
  globalBest,
  seeds: archived,
};
fs.writeFileSync(path.join(args.output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.error(`archived ${archived.length} ${capacity.join('x')} seeds (with globalBest: ${globalBest ? 'yes' : 'none'}) at ${portable(args.output)}`);
