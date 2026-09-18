import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import request from 'graphql-request';
import ADDRESSES from '../../helpers/coreAssets.json';
import { Interface } from 'ethers';

// https://sentry.trading/sentry-guide.md. protocolDayData.feesWETH mixes
// WETH and stocks; even per-token totals mix currencies on Ink stock routes.
const prefix = 'https://api.goldsky.com/api/public/project_cmm7vh5xwsa8m01qmdr7w7u62/subgraphs/';
type Factory = { address: string; block: number; version: number };
const config: Record<string, { start: string; endpoint: string; weth: string; manager: string; factories: Factory[]; hooks: string[]; routers: string[]; stockRouter: string }> = {
  robinhood: {
    start: '2026-07-02', endpoint: prefix + 'sentry-robinhood/1.2.0/gn', weth: ADDRESSES.robinhood.WETH,
    manager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',
    factories: [
      { address: '0x9e8f6f8214b01Fd4Cf1d73FB1fb7cf9f811036Cb', block: 1431636, version: 3 },
      { address: '0x472286b7d5c1b2a3ce1132ef73d3bccf446c5cc1', block: 12274076, version: 4 },
      { address: '0xd0A93885a387e3a8a14dd82776CF9104a3676b3A', block: 13991230, version: 4 },
    ],
    hooks: [
      '0x27fa5c40935c5559721B864806092983E1dbf0cc',
      '0x9ee578fbfc98c108dfd2e680ebcdb916a373f0cc',
      '0x7e6e258851575bd3f69e7a01981066a26329b0cc',
      '0x5DaA88b65Bd47199eC92d3cDe01B56348e1270CC',
      '0x35c0098836FA0d10A015A95bf02C16387814f0CC',
      '0x730AbADbB4f328520e5350F59126fbE1D67F70cc',
      '0x2B26f7dE7c98889E47BDe09315ecB2044Bd238cC',
    ],
    routers: [
      '0x8bfDC6Cc38DB45BDaf2F254415251b109058a97C',
      '0x5811A5C7c4F73290Cc9Aa2235245bC9F48523662',
      '0x59937701b7e4005dfdc921bf05181cd50f0bbe53',
      '0x4415F2360bfD9b1bF55500cB28Fa41DF95cb2D2B',
      '0xe13aBd4a66F268CbB6DbCB8A294762Ff9415AbB7',
      '0xa49490EF078373c8D6A10d1B306850a4675Fbe79',
      '0xba67aF9D480329c48474303E51c1Dae1f78ACF2A',
      '0x865B04F7bf58594737dd8f65c071c7a3a9e2E7E6',
      '0x641F05602B3dee5B35bAc08A1269827f2E84445D',
    ],
    stockRouter: '0x0c9F2b9CE60cd85284C46af108A09B3925750316',
  },
  ink: {
    start: '2026-03-13', endpoint: prefix + 'sentry-ink/1.6.0/gn', weth: ADDRESSES.ink.WETH,
    manager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    factories: [
      { address: '0xDc37e11B68052d1539fa23386eE58Ac444bf5BE1', block: 39943151, version: 3 },
      { address: '0x733733E8eAbB94832847AbF0E0EeD6031c3EB2E4', block: 40126112, version: 3 },
      { address: '0xcF44b151aee1Ef69677f24cadED4d2d61b0D45BD', block: 52014353, version: 4 },
    ],
    hooks: [
      '0x976697AdCF27D0962d3B0b6304D5975bA647B0Cc',
      '0x68ad7d7e2905656B7d89e56a43a6872F8487B0cC',
      '0x18195c33D8150B2e7f5166FC79e29a6C2B1fB0CC',
      '0x18d155d3A8D65Ab32793926392a11671C78038cc',
    ],
    routers: ['0x29fc1953A12185c10B6eE8697419f13c5cb93afa'],
    stockRouter: '0x1b4D919149912c9781b086C8242729EE317631C8',
  },
};
const events = {
  v3Pool: 'event PoolInitialized(address indexed pool,address indexed token)',
  v4Pool: 'event TokenDeployed(address indexed token,string name,string symbol,address indexed creator,bytes32 indexed poolId)',
  split: 'event CreatorFeeBpsUpdated(uint256 oldCreatorFeeBps,uint256 newCreatorFeeBps)',
  app: 'event AppFeePaid(address indexed token,address indexed recipient,bool isBuy,uint256 creatorAmount,uint256 treasuryAmount)',
  reflection: 'event ReflectionPaid(address indexed token,address indexed base,uint256 amount)',
  compound: 'event LpFeeAccrued(bytes32 indexed poolId,uint256 amount)',
  stock: 'event FeePaid(address indexed token,address indexed base,uint256 reflection,uint256 creatorCut,uint256 potCut,uint256 sinkCut,bool reflectionToTreasury)',
  weth: 'event FeePaid(address indexed token,uint256 reflection,uint256 creatorCut,uint256 potCut,uint256 sinkCut,bool reflectionToTreasury)',
  inkRouter: 'event WethFeePaid(address indexed token,address indexed creator,uint256 creatorCut,uint256 potCut,uint256 sinkCut)',
  stockRouter: 'event AppFeePaid(address indexed token,address indexed asset,address referrer,uint256 referralCut,uint256 treasuryCut)',
  router: 'event SwapExecuted(address indexed sender,address indexed token,bool indexed isBuy,uint256 amountIn,uint256 amountOut,uint256 feeAmount)',
  referral: 'event ReferralPaid(address indexed referrer,address indexed swapper,address indexed token,bool isBuy,uint256 amount)',
  v3Swap: 'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)',
  v4Swap: 'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)',
};
const lower = (x: string) => x.toLowerCase();
const abs = (x: bigint) => x < 0n ? -x : x;

const fetch = async (options: FetchOptions) => {
  const c = config[options.chain];
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  // Ink public RPCs cap log queries at 10,000 blocks; leave room for the
  // SDK's cache overlap. Robinhood supports wider ranges.
  const getLogs: FetchOptions['getLogs'] = args => options.getLogs({ fromBlock: fromBlock + 1, toBlock, maxBlockRange: options.chain === 'ink' ? 9900 : undefined, ...args });
  const dailyFees = options.createBalances(), dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();
  const allocate = (asset: string, creator: bigint, treasury: bigint, rewards = 0n, reinvest = 0n, label = 'Hook Fees') => {
    dailyFees.add(asset, creator + treasury + rewards + reinvest, label);
    dailySupplySideRevenue.add(asset, creator, 'Creator Fees');
    dailySupplySideRevenue.add(asset, rewards, 'Launch Token Rewards');
    dailySupplySideRevenue.add(asset, reinvest, 'Liquidity Reinvestment');
    dailyRevenue.add(asset, treasury, 'Fees To Treasury');
  };
  // Use the subgraph for immutable token/base metadata, never fee totals.
  const meta: any = await request(c.endpoint, '{ _meta { block { number } hasIndexingErrors } }');
  if (meta._meta.hasIndexingErrors || meta._meta.block.number < toBlock) throw new Error('Sentry metadata index is behind the requested window');
  const tokenBase = new Map<string, string>();
  let cursor = '';
  while (true) {
    const data: any = await request(c.endpoint, `{ tokens(first:1000,orderBy:id,orderDirection:asc,where:{id_gt:"${cursor}"},block:{number:${toBlock}}) { id baseToken } }`);
    data.tokens.forEach((t: any) => tokenBase.set(lower(t.id), lower(t.baseToken)));
    if (data.tokens.length < 1000) break;
    cursor = data.tokens[data.tokens.length - 1].id;
  }
  // The indexed swap inventory limits RPC reads to pools active in this
  // window. Fee amounts still come from their onchain events.
  const activePools = new Set<string>();
  cursor = '';
  while (true) {
    const data: any = await request(c.endpoint, `{ swaps(first:1000,orderBy:id,orderDirection:asc,where:{id_gt:"${cursor}",block_gt:${fromBlock},block_lte:${toBlock}}) { id pool { id } } }`);
    data.swaps.forEach((s: any) => activePools.add(lower(s.pool.id)));
    if (data.swaps.length < 1000) break;
    cursor = data.swaps[data.swaps.length - 1].id;
  }
  type Pool = { token: string; base: string; factory: Factory; version: number };
  const pools = new Map<string, Pool>(), launched = new Set<string>();
  const splits = new Map<string, any[]>();
  const endSplits = new Map<string, number>();
  for (const f of c.factories) {
    if (toBlock < f.block) continue;
    const ls = await options.getLogs({ target: f.address, eventAbi: f.version === 3 ? events.v3Pool : events.v4Pool, fromBlock: f.block, cacheInCloud: true });
    for (const l of ls) {
      const token = lower(l.token), base = tokenBase.get(token);
      if (!base) throw new Error(`Missing base metadata for launch ${token}`);
      pools.set(lower(f.version === 3 ? l.pool : l.poolId), { token, base: lower(base), factory: f, version: f.version });
      launched.add(token);
    }
    // Start from the end-of-window configuration and undo later updates for
    // each swap. This avoids rescanning all split changes since deployment.
    splits.set(lower(f.address), (await getLogs({ target: f.address, eventAbi: events.split, entireLog: true })).sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber) || Number(b.index) - Number(a.index)));
  }
  const baseOf = (token: string) => {
    const base = tokenBase.get(lower(token));
    if (!base) throw new Error(`Missing fee currency for ${token}`);
    return base;
  };
  const valid = (a: any) => launched.has(lower(a.token));
  const logs = (targets: string[], eventAbi: string) => targets.length ? getLogs({ targets, eventAbi }) : Promise.resolve([]);
  // Count allocations once, not subsequent collections/distributions/compounding.
  const [apps, reflections, compounds, stocks, weths] = await Promise.all([
    logs(c.hooks, events.app), logs(c.hooks, events.reflection), logs(c.hooks, events.compound),
    logs(c.hooks, events.stock), logs(c.hooks, events.weth),
  ]);
  for (const a of apps) if (valid(a)) allocate(baseOf(a.token), BigInt(a.creatorAmount), BigInt(a.treasuryAmount));
  for (const a of reflections) if (valid(a)) allocate(a.base, 0n, 0n, BigInt(a.amount));
  for (const a of compounds) { const p = pools.get(lower(a.poolId)); if (p) allocate(p.base, 0n, 0n, 0n, BigInt(a.amount)); }
  for (const a of [...stocks, ...weths]) if (valid(a)) {
    const reflection = BigInt(a.reflection);
    allocate(a.base ?? c.weth, BigInt(a.creatorCut), a.reflectionToTreasury ? reflection : 0n,
      BigInt(a.potCut) + BigInt(a.sinkCut) + (a.reflectionToTreasury ? 0n : reflection));
  }
  // Router fees are additional charges; router volume is never added to pool volume.
  const [routerFees, referrals] = await Promise.all([logs(c.routers, events.router), logs(c.routers, events.referral)]);
  const routerTotal = routerFees.reduce((s, a) => s + BigInt(a.feeAmount), 0n);
  const referralTotal = referrals.reduce((s, a) => s + BigInt(a.amount), 0n);
  if (referralTotal > routerTotal) throw new Error('Router referrals exceed fees');
  dailyFees.add(c.weth, routerTotal, 'Router Fees');
  dailyRevenue.add(c.weth, routerTotal - referralTotal, 'Router Fees To Treasury');
  dailySupplySideRevenue.add(c.weth, referralTotal, 'Referral Fees');
  if (options.chain === 'ink') {
    for (const a of await logs([c.stockRouter], events.inkRouter)) if (valid(a))
      allocate(c.weth, BigInt(a.creatorCut), 0n, BigInt(a.potCut) + BigInt(a.sinkCut), 0n, 'Router Fees');
  } else {
    for (const a of await logs([c.stockRouter], events.stockRouter)) {
      const referral = BigInt(a.referralCut), treasury = BigInt(a.treasuryCut);
      dailyFees.add(a.asset, referral + treasury, 'Router Fees');
      dailyRevenue.add(a.asset, treasury, 'Router Fees To Treasury');
      dailySupplySideRevenue.add(a.asset, referral, 'Referral Fees');
    }
  }
  // TODO before merge: reconcile historical v3 upgrades, migrated agent
  // positions and GoPumpMe's 100% creator allocation. A global factory split
  // alone cannot describe every legacy position.
  // Preserve the prior base-notional estimate for legacy LP fees. Skimming
  // hooks set the PoolManager LP fee to zero, so these streams do not overlap.
  const lpFee = async (p: Pool, a: any, block: number, index: number, fee: bigint) => {
    const quoteIs0 = lower(p.base) < lower(p.token);
    const amount = abs(BigInt(quoteIs0 ? a.amount0 : a.amount1)) * fee / 1000000n;
    const factoryKey = lower(p.factory.address);
    if (!endSplits.has(factoryKey)) endSplits.set(factoryKey, Number(await options.api.call({ target: p.factory.address, abi: 'uint256:creatorFeeBps' })));
    let bps = endSplits.get(factoryKey)!;
    for (const l of splits.get(lower(p.factory.address)) ?? [])
      if (Number(l.blockNumber) > block || (Number(l.blockNumber) === block && Number(l.index) > index)) bps = Number(l.args.oldCreatorFeeBps);
    const creator = amount * BigInt(bps) / 10000n;
    allocate(p.base, creator, amount - creator, 0n, 0n, 'Legacy LP Fees');
  };
  const v3 = [...pools].filter(([id, p]) => p.version === 3 && activePools.has(id)).map(([id]) => id);
  if (v3.length) for (const l of await getLogs({ targets: v3, eventAbi: events.v3Swap, entireLog: true }))
    await lpFee(pools.get(lower(l.address))!, l.args, Number(l.blockNumber), Number(l.index), 10000n);
  const v4 = [...pools].filter(([id, p]) => p.version === 4 && activePools.has(id)).map(([id]) => id);
  const swapTopic = new Interface([events.v4Swap]).getEvent('Swap')!.topicHash;
  for (let i = 0; i < v4.length; i += 100) {
    const ls = await getLogs({ target: c.manager, eventAbi: events.v4Swap, topics: [swapTopic, v4.slice(i, i + 100)] as any, entireLog: true });
    for (const l of ls) if (BigInt(l.args.fee) > 0n) await lpFee(pools.get(lower(l.args.id))!, l.args, Number(l.blockNumber), Number(l.index), BigInt(l.args.fee));
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const revenue = { 'Fees To Treasury': 'Explicit hook treasury allocations and the configured treasury share of estimated legacy LP fees.', 'Router Fees To Treasury': 'Router fees less referrals, in the emitted fee asset.' };
const adapter: SimpleAdapter = {
  version: 2, pullHourly: true, fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, c]) => [chain, { start: c.start }])),
  doublecounted: true,
  methodology: {
    Fees: 'Fees allocated by Sentry launch hooks and fee routers in their actual payment assets, plus legacy pool base-notional fee estimates. Deferred skims are recognized when FeePaid is emitted on delivery. Later collection, dividend distribution and compounding are not counted again. Pool fees cover factory-deployed launches only; router app fees also cover third-party tokens traded through Sentry. Downstream treasury reallocations are excluded.',
    Revenue: 'Explicit hook/router treasury amounts plus the configured treasury portion of legacy LP fee estimates. Community pots and growth-sink allocations are supply-side rewards, not Sentry treasury revenue.',
    ProtocolRevenue: 'Same treasury allocations as Revenue.',
    SupplySideRevenue: 'Creator allocations, launch-token dividends, community reward/growth allocations, liquidity reinvestment and router referrals. Legacy creator LP fees are estimates, not cash paid that day.',
  },
  breakdownMethodology: {
    Fees: { 'Hook Fees': 'AppFeePaid, ReflectionPaid, LpFeeAccrued and FeePaid allocations from launch hooks.', 'Router Fees': 'SwapExecuted/AppFeePaid/WethFeePaid fee allocations from Sentry routers.', 'Legacy LP Fees': 'Absolute base-side swap notional times the v3 1% tier or v4 Swap fee in ppm, preserving the prior base-notional estimate.' },
    Revenue: revenue, ProtocolRevenue: revenue,
    SupplySideRevenue: { 'Creator Fees': 'Emitted creator payouts plus estimated legacy LP creator allocations using factory split changes.', 'Launch Token Rewards': 'Dividends and community pot/growth-sink allocations for launched-token ecosystems.', 'Liquidity Reinvestment': 'Hook fees earmarked for permanent launch-pool liquidity.', 'Referral Fees': 'Referral payments from router fees.' },
  },
};
export default adapter;
