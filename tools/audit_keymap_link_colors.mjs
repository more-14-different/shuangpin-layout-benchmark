import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');

function parseArgs(argv) {
  const args = {
    html: resolve('a7_CKT_R11.html'),
    edge: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--html') args.html = resolve(argv[++index]);
    else if (argv[index] === '--edge') args.edge = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!existsSync(args.html)) throw new Error(`publication HTML not found: ${args.html}`);
if (!existsSync(args.edge)) throw new Error(`browser executable not found: ${args.edge}`);

const browser = await chromium.launch({executablePath: args.edge, headless: true});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));

try {
  await page.goto(pathToFileURL(args.html).href, {waitUntil: 'load', timeout: 120_000});
  await page.waitForFunction(() => window.App7?.ready, null, {timeout: 120_000});
  const audit = await page.evaluate(() => {
    const failures = [];
    for (const entry of window.App7.data.entries) {
      try {
        window.App7.keyboardSVG(entry);
      } catch (error) {
        failures.push({id: entry.id, error: String(error)});
      }
    }
    let tonedCount = 0;
    for (const native of snowJiandaoSchemes()) {
      try {
        auditTonedKeymapSVG(snowJiandaoKeyboardSVG('semantic', null, native), native);
        tonedCount++;
      } catch (error) {
        failures.push({id: native.id, error: String(error)});
      }
    }
    return {count: window.App7.data.entries.length + tonedCount, failures};
  });
  if (audit.failures.length || pageErrors.length) {
    throw new Error(JSON.stringify({...audit, pageErrors}, null, 2));
  }
  console.log(`键位图 link 配色审计通过：${audit.count} 个方案的抽象链约束，带调方案另查最终 SVG 的源键/目标标签及 W/Y 语义，0 个已检查冲突。`);
} finally {
  await browser.close();
}
