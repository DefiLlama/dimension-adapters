import { FetchOptions } from '../../adapters/types';
import { getPositionedLogArgs } from '../logs';
import { ABI, CURVE, FAZE, HOOK, NATIVE, START_BLOCK } from './constants';

// SDK fromApi is the opening boundary; include blocks strictly after it through toApi.
async function windowLogs(options: FetchOptions, target: string, eventAbi: string) {
  return options.getLogs({ target, eventAbi, fromBlock: (await options.getFromBlock()) + 1, maxBlockRange: 6250 });
}

// Only configuration/discovery events are cached; trades and fee settlements use the requested window.
export async function launches(options: FetchOptions) {
  return getPositionedLogArgs(options, { target: CURVE, eventAbi: ABI.Launched, fromBlock: START_BLOCK, cacheInCloud: true, maxBlockRange: 6250 });
}

export function addQuote(balance: ReturnType<FetchOptions['createBalances']>, quote: string, amount: bigint, label?: string) {
  // Native USDC is 18 decimals; the SDK gas-token mapping must handle it as native, not 6-decimal ERC20 units.
  if (quote.toLowerCase() === NATIVE) balance.addGasToken(amount.toString(), label);
  else balance.add(quote.toLowerCase(), amount.toString(), label);
}

export async function trades(options: FetchOptions) {
  const buys = await windowLogs(options, CURVE, ABI.Bought);
  const sells = await windowLogs(options, CURVE, ABI.Sold);
  const tokens: string[] = [...new Set([...buys, ...sells].map(t => String(t.token).toLowerCase()))];
  // The fixed curve emitter authenticates trades. Read only traded tokens instead of scanning all launch history.
  const coins = tokens.length ? await options.toApi.multiCall({ target: CURVE, abi: ABI.getCoin, calls: tokens }) : [];
  const quotes = new Map(tokens.map((token, i) => [token, String(coins[i].quoteToken)]));
  const quoteOf = (token: string) => {
    const quote = quotes.get(token.toLowerCase());
    if (!quote) throw new Error(`FAZE trade without authenticated launch: ${token}`);
    return quote;
  };
  return { buys, sells, quoteOf };
}

export async function fetchVolume(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const { buys, sells, quoteOf } = await trades(options);
  for (const b of buys) addQuote(dailyVolume, quoteOf(b.token), BigInt(b.ethGross));
  for (const s of sells) addQuote(dailyVolume, quoteOf(s.token), BigInt(s.ethOut) + BigInt(s.fee));
  return { dailyVolume };
}

async function collectFees(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const { buys, sells, quoteOf } = await trades(options);
  for (const t of [...buys, ...sells]) addQuote(dailyFees, quoteOf(t.token), BigInt(t.fee), 'Curve Trading Fees');

  const fromBlock = await options.getFromBlock();
  const created = await getPositionedLogArgs(options, { target: CURVE, eventAbi: ABI.Launched, fromBlock: fromBlock + 1, maxBlockRange: 6250 });
  const graduations = await windowLogs(options, CURVE, ABI.Graduated);
  const graduatedCoins = graduations.length ? await options.toApi.multiCall({ target: CURVE, abi: ABI.getCoin, calls: graduations.map(g => g.token) }) : [];
  graduations.forEach((g, i) => addQuote(dailyFees, graduatedCoins[i].quoteToken, BigInt(g.migrationFee), 'Graduation Fees'));

  // The constructor does not emit LaunchFeeSet. Its verified launchFee_ is 0.001 native USDC (18 decimals).
  // Source: BondingCurveV4 constructor arguments at the CURVE explorer address. Later windows read opening state.
  const changes = await getPositionedLogArgs(options, { target: CURVE, eventAbi: ABI.LaunchFeeSet, fromBlock: fromBlock + 1, maxBlockRange: 6250 });
  const order = (a: any, b: any) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
  changes.sort(order);
  const inWindow = created.filter(l => l.blockNumber > fromBlock);
  const initialFee = !inWindow.length ? 0n : fromBlock < START_BLOCK ? 1_000_000_000_000_000n : BigInt(await options.fromApi.call({ target: CURVE, abi: 'uint256:launchFee' }));
  for (const launch of inWindow) {
    const active = changes.filter(c => order(c, launch) < 0).at(-1);
    addQuote(dailyFees, NATIVE, active ? BigInt(active.launchFee) : initialFee, 'Token Launch Fees');
  }

  const pools = await getPositionedLogArgs(options, { target: HOOK, eventAbi: ABI.PoolRegistered, fromBlock: START_BLOCK, cacheInCloud: true, maxBlockRange: 6250 });
  const quotes = new Map(pools.map(p => [String(p.poolId).toLowerCase(), String(p.quote)]));
  const hookAmounts = new Map<string, bigint>();
  const settlements = await windowLogs(options, HOOK, ABI.FeesSettled);
  for (const s of settlements) {
    const key = String(s.poolId).toLowerCase();
    if (!quotes.has(key)) throw new Error('FAZE fee for an unregistered pool');
    hookAmounts.set(key, (hookAmounts.get(key) || 0n) + BigInt(s.amount));
  }
  if (pools.length) {
    const closing = await options.toApi.multiCall({ target: HOOK, abi: ABI.pools, calls: pools.map(p => p.poolId) });
    const existing = pools.filter(p => p.blockNumber <= fromBlock);
    const opening = existing.length ? await options.fromApi.multiCall({ target: HOOK, abi: ABI.pools, calls: existing.map(p => p.poolId) }) : [];
    const old = new Map(existing.map((p, i) => [String(p.poolId).toLowerCase(), BigInt(opening[i].accrued)]));
    pools.forEach((p, i) => {
      const key = String(p.poolId).toLowerCase();
      const amount = (hookAmounts.get(key) || 0n) + BigInt(closing[i].accrued) - (old.get(key) || 0n);
      if (amount < 0n) throw new Error('Negative FAZE accrued hook fees; verify historical boundaries');
      addQuote(dailyFees, p.quote, amount, 'Hook Trading Fees');
    });
  }
  return { dailyFees, pools, settlements };
}

export async function fetchGrossFees(options: FetchOptions) {
  const { dailyFees } = await collectFees(options);
  return { dailyFees };
}

// FAZE's own pool creator allocation belongs to the FAZE project (team-confirmed).
// Realized buybacks are a separate capital allocation: never add them to gross fees.
export async function fetchFees(options: FetchOptions) {
  const { dailyFees, pools, settlements } = await collectFees(options);
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const fromBlock = await options.getFromBlock();
  const byId = new Map(pools.map(p => [String(p.poolId).toLowerCase(), p]));
  const allocated = new Map<string, { creator: bigint, compound: bigint }>();
  for (const p of pools) allocated.set(String(p.poolId).toLowerCase(), { creator: 0n, compound: 0n });
  for (const s of settlements) {
    const a = allocated.get(String(s.poolId).toLowerCase());
    if (!a || BigInt(s.amount) !== BigInt(s.creatorAmount) + BigInt(s.compoundAmount) + BigInt(s.treasuryAmount)) throw new Error('FAZE settlement does not reconcile');
    a.creator += BigInt(s.creatorAmount); a.compound += BigInt(s.compoundAmount);
  }
  if (pools.length) {
    const closing = await options.toApi.multiCall({ target: HOOK, abi: ABI.hookPendingFees, calls: pools.map(p => p.poolId) });
    const existing = pools.filter(p => p.blockNumber <= fromBlock);
    const opening = existing.length ? await options.fromApi.multiCall({ target: HOOK, abi: ABI.hookPendingFees, calls: existing.map(p => p.poolId) }) : [];
    const old = new Map(existing.map((p, i) => [String(p.poolId).toLowerCase(), opening[i]]));
    pools.forEach((p, i) => {
      const key = String(p.poolId).toLowerCase(), a = allocated.get(key)!, prev = old.get(key);
      a.creator += BigInt(closing[i].creatorAmount) - BigInt(prev?.creatorAmount ?? 0);
      a.compound += BigInt(closing[i].compoundAmount) - BigInt(prev?.compoundAmount ?? 0);
    });
  }
  for (const [id, a] of allocated) {
    const p = byId.get(id)!;
    if (String(p.asset).toLowerCase() !== FAZE) addQuote(dailySupplySideRevenue, p.quote, a.creator, 'Trading Fees to Creators');
    addQuote(dailySupplySideRevenue, p.quote, a.compound, 'Trading Fees to Locked Liquidity');
  }
  // Creator sharing on curves is immutable per launch; read only opted-in launches.
  const shared = (await launches(options)).filter(l => l.terms.creatorCurveFees);
  if (shared.length) {
    const byToken = new Map(shared.map(l => [String(l.token).toLowerCase(), l]));
    const amounts = new Map(shared.map(l => [String(l.token).toLowerCase(), 0n]));
    for (const s of await windowLogs(options, CURVE, ABI.FeesCollected)) {
      const key = String(s.token).toLowerCase();
      if (amounts.has(key)) amounts.set(key, amounts.get(key)! + BigInt(s.creatorAmount));
    }
    const closing = await options.toApi.multiCall({ target: CURVE, abi: ABI.curvePendingFees, calls: shared.map(l => l.token) });
    const existing = shared.filter(l => l.blockNumber <= fromBlock);
    const opening = existing.length ? await options.fromApi.multiCall({ target: CURVE, abi: ABI.curvePendingFees, calls: existing.map(l => l.token) }) : [];
    const old = new Map(existing.map((l, i) => [String(l.token).toLowerCase(), opening[i]]));
    shared.forEach((l, i) => {
      const key = String(l.token).toLowerCase();
      amounts.set(key, amounts.get(key)! + BigInt(closing[i].creatorAmount) - BigInt(old.get(key)?.creatorAmount ?? 0));
    });
    for (const [token, amount] of amounts) if (token !== FAZE) addQuote(dailySupplySideRevenue, byToken.get(token)!.terms.quoteToken, amount, 'Trading Fees to Creators');
  }
  // Revenue is retained fees, including FAZE's own project creator allocation.
  // Do not infer treasury cash balances or subtract buybacks a second time.
  const supply = dailySupplySideRevenue.getBalances();
  const fees = dailyFees.getBalances();
  for (const token of new Set([...Object.keys(fees), ...Object.keys(supply)])) {
    dailyRevenue.add(token, (BigInt(fees[token] ?? 0) - BigInt(supply[token] ?? 0)).toString(), { skipChain: true, label: 'Fees Retained by FAZE' });
  }
  const BURNER = '0x0379DE4B544c6Ac8927f4BCf71553a5816aF1bd3';
  // Verified factory source: explorer.arc.io/address/0xCEC9C59E1E79908e80a3BCFE7719BfDd469f5f63?tab=contract
  // ethIn is actual quote spent (refund-adjusted); bountyWei is separate and excluded.
  const burns = await windowLogs(options, BURNER, 'event Burned(address indexed caller, uint256 ethIn, uint256 tokensBurned, uint256 bountyWei)');
  for (const burn of burns) addQuote(dailyHoldersRevenue, NATIVE, BigInt(burn.ethIn), 'FAZE Buybacks');
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
}
