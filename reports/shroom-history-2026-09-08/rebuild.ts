// Run from the repository root with ts-node and ROBINHOOD_RPC set to the mainnet
// public endpoint. This report reuses the already validated, unchanged LP and
// token-sweep amounts, and fetches the previously missing treasury MU receipts.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import runAdapter from '../../adapters/utils/runAdapter';
import treasury, { fetchTreasuryDividends } from '../../fees/shroom-treasury';

const dir = __dirname;
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const save = (name: string, value: any) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hook = read('shroom-hourly.json');
const lp = read('shroom-pol-hourly.json'); // Original LP-only snapshot, retained for provenance.
for (const source of [hook, lp]) {
  if (!source.complete || source.slots.length !== 144) throw new Error('Incomplete source snapshot');
  source.slots.forEach((slot: any, i: number) => {
    if (slot.startTimestamp !== Date.parse('2026-09-02T00:00:00Z') / 1000 + i * 3600 || slot.endTimestamp !== slot.startTimestamp + 3600)
      throw new Error('Source coverage gap');
  });
}
const adapterSHA256 = hash(path.join(dir, '../../fees/shroom-treasury.ts'));
const cashFile = 'treasury-dividends-hourly.json';
const cash = fs.existsSync(path.join(dir, cashFile)) ? read(cashFile) : { adapterSHA256, slots: [], complete: false };
if (cash.adapterSHA256 !== adapterSHA256) throw new Error('Dividend code changed; refusing mixed revisions');
const dividendModule = { ...treasury, fetch: async (options: any) => {
  const receipts = await fetchTreasuryDividends(options);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.add(receipts, 'MU Dividends');
  dailyRevenue.add(receipts, 'MU Dividends To Treasury');
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
} };
const usd = (s: any, key: string) => s.breakdownByToken?.robinhood?.[key]?.usdTvl ?? 0;
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function report() {
  const days: any[] = [];
  for (let d = 0; d < 6; d++) {
    const h = hook.slots.slice(d * 24, (d + 1) * 24), p = lp.slots.slice(d * 24, (d + 1) * 24);
    const c = cash.slots.filter((s: any) => s.startTimestamp >= h[0].startTimestamp && s.endTimestamp <= h[23].endTimestamp);
    const sum = (slots: any[], key: string) => slots.reduce((v, s) => v + usd(s, key), 0);
    const tokenFees = sum(h, 'dailyFees'), tokenRevenue = sum(h, 'dailyRevenue'), pons = sum(h, 'dailySupplySideRevenue');
    const treasuryLPIncome = sum(p, 'dailyRevenue'), treasuryDividends = c.length === 24 ? sum(c, 'dailyRevenue') : null;
    if (Math.abs(tokenFees - tokenRevenue - pons) > 1e-6) throw new Error('Token identity failed');
    days.push({ date: new Date(h[0].startTimestamp * 1000).toISOString().slice(0, 10), complete: c.length === 24,
      tokenFees, tokenRevenue, tokenHoldersRevenue: tokenRevenue, pons,
      treasuryLPIncome, treasuryDividends, treasuryRevenue: treasuryDividends === null ? null : treasuryLPIncome + treasuryDividends,
      treasuryDividendRawMU: c.length === 24 ? c.reduce((v: bigint, s: any) => v + BigInt(s.breakdownByToken?.robinhood?.dailyRevenue?.rawTokenBalances?.['robinhood:0xff080c8ce2e5feadaca0da81314ae59d232d4afd'] || 0), 0n).toString() : null,
    });
  }
  const complete = days.every(d => d.complete);
  const result = { generatedAt: new Date().toISOString(), complete, currency: 'USD',
    scopes: 'Token and treasury are separate views, not additive. Treasury revenue is LP income plus MU receipts; token revenue is all-holder MU dividend allocation.',
    provenance: { tokenSnapshotSHA256: hook.adapterSHA256, lpSnapshotSHA256: lp.adapterSHA256, treasuryAdapterSHA256: adapterSHA256,
      note: 'LP and token amounts reuse the original completed 144-hour runs. MU receipts are freshly run through fetchTreasuryDividends and SDK hourly pricing.' },
    days, totals: complete ? Object.fromEntries(['tokenFees','tokenRevenue','pons','treasuryLPIncome','treasuryDividends','treasuryRevenue'].map(k => [k, days.reduce((n, d) => n + d[k], 0)])) : null };
  save('daily-summary.json', result);
  const columns = ['date','tokenFees','tokenRevenue','pons','treasuryLPIncome','treasuryDividends','treasuryRevenue','treasuryDividendRawMU'];
  fs.writeFileSync(path.join(dir, 'daily-summary.csv'), columns.join(',') + '\n' + days.map(d => columns.map(k => d[k] ?? 'PENDING').join(',')).join('\n') + '\n');
  const lines = ['# SHROOM token and Shroom treasury income', '', `Status: ${complete ? 'Complete' : 'In progress — treasury dividends pending'}. UTC dates, September 2–7, 2026.`, '',
    '**These columns are separate scopes and must not be added together.** The earlier combined revenue table is superseded.', '',
    '| Date | Token fees | Token revenue: MU dividend allocation | Treasury LP income | Treasury MU dividends received | Treasury revenue |',
    '|---|---:|---:|---:|---:|---:|', ...days.map(d => `| ${d.date} | $${fmt(d.tokenFees)} | $${fmt(d.tokenRevenue)} | $${fmt(d.treasuryLPIncome)} | ${d.complete ? '$' + fmt(d.treasuryDividends) : 'Pending'} | ${d.complete ? '$' + fmt(d.treasuryRevenue) : 'Pending'} |`)];
  if (result.totals) { const t: any = result.totals; lines.push(`| **Total** | **$${fmt(t.tokenFees)}** | **$${fmt(t.tokenRevenue)}** | **$${fmt(t.treasuryLPIncome)}** | **$${fmt(t.treasuryDividends)}** | **$${fmt(t.treasuryRevenue)}** |`); }
  lines.push('', 'Token revenue uses the agreed hook-sweep basis: MU allocated for all SHROOM holders, not necessarily paid to wallets that same hour. Token fees = token revenue + Pons supply-side share.', '',
    'Treasury revenue = earned LP fees + actual MU receipts from the confirmed distributor into the two treasury wallets. No all-holder allocations or LP principal are added. Treasury fees and protocol revenue equal treasury revenue under the repository income statement convention; this does not imply the treasury charges a new user fee.', '',
    'The shared distributor transfers identify the MU payer and recipient, not the underlying launch token. Treasury receipts are therefore reported as MU dividend income without claiming an on-chain SHROOM-only attribution. Never total the shared distributor for the token view.', '',
    'USD amounts use unrounded hourly SDK valuations. Unpriced SHROOM LP fee amounts remain in the original raw balances and are excluded from USD totals. September 8 is incomplete and excluded.', '',
    'Sources: `shroom-hourly.json` (token), `shroom-pol-hourly.json` (unchanged LP component), `treasury-dividends-hourly.json` (new MU receipts). Code provenance is in `daily-summary.json`.');
  fs.writeFileSync(path.join(dir, 'daily-summary.md'), lines.join('\n') + '\n');
}
async function main() {
  report(); // Immediately supersede the misleading combined summary, even during a partial run.
  for (const slot of hook.slots) {
    if (cash.slots.some((s: any) => s.endTimestamp === slot.endTimestamp)) continue;
    let result: any;
    for (let attempt = 0; ; attempt++) {
      try { result = await runAdapter({ module: dividendModule, name: 'shroom-treasury-dividends', endTimestamp: slot.endTimestamp, runWindowInSeconds: 3600, withMetadata: true }); break; }
      catch (error) { if (attempt >= 3) throw error; console.error('Retry', slot.endTimestamp, error); await new Promise(r => setTimeout(r, 45000)); }
    }
    cash.slots.push({ startTimestamp: slot.startTimestamp, endTimestamp: slot.endTimestamp, breakdownByToken: result.breakdownByToken });
    cash.complete = cash.slots.length === 144;
    save(cashFile, cash); report();
    console.log('DIVIDENDS', cash.slots.length + '/144', new Date(slot.startTimestamp * 1000).toISOString(), usd(cash.slots[cash.slots.length - 1], 'dailyRevenue'));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
