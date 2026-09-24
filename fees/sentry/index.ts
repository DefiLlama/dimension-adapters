import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import request from 'graphql-request';
import ADDRESSES from '../../helpers/coreAssets.json';
import { collections } from './collections';
import { nativeRouterFees } from './nativeRouter';

// https://sentry.trading/sentry-guide.md. protocolDayData.feesWETH mixes
// WETH and stocks; even per-token totals mix currencies on Ink stock routes.
const prefix = 'https://api.goldsky.com/api/public/project_cmm7vh5xwsa8m01qmdr7w7u62/subgraphs/';
type Factory = { address: string; block: number; version: number };
const config: Record<string, { start: string; endpoint: string; weth: string; vault: string; factories: Factory[]; hooks: string[]; routers: string[]; stockRouter: string; bundleCollector: string }> = {
  robinhood: {
    start: '2026-07-02', endpoint: prefix + 'sentry-robinhood/1.2.0/gn', weth: ADDRESSES.robinhood.WETH,
    vault: '0x0F0E601041Ec765B8bAB8c166840E291253F2Df0',
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
      // Legacy stock router; SwapExecuted fees are native ETH, not stock units.
      '0xD070e996819CE52d33cE6AC3B15AD6ea02D77eA0',
    ],
    stockRouter: '0x0c9F2b9CE60cd85284C46af108A09B3925750316',
    bundleCollector: '0x45ab85ba218a6aa2e9dc488b71f46766297d59da',
  },
  ink: {
    start: '2026-03-13', endpoint: prefix + 'sentry-ink/1.6.0/gn', weth: ADDRESSES.ink.WETH,
    vault: '0x86585D4474C78c1C0fA1f8771682E9aD020787eC',
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
    bundleCollector: '0xfc8e152892a600b1285381f4dbeef17b8195080f',
  },
};
const events = {
  app: 'event AppFeePaid(address indexed token,address indexed recipient,bool isBuy,uint256 creatorAmount,uint256 treasuryAmount)',
  reflection: 'event ReflectionPaid(address indexed token,address indexed base,uint256 amount)',
  compound: 'event LpFeeAccrued(bytes32 indexed poolId,uint256 amount)',
  stock: 'event FeePaid(address indexed token,address indexed base,uint256 reflection,uint256 creatorCut,uint256 potCut,uint256 sinkCut,bool reflectionToTreasury)',
  weth: 'event FeePaid(address indexed token,uint256 reflection,uint256 creatorCut,uint256 potCut,uint256 sinkCut,bool reflectionToTreasury)',
  inkRouter: 'event WethFeePaid(address indexed token,address indexed creator,uint256 creatorCut,uint256 potCut,uint256 sinkCut)',
  stockRouter: 'event AppFeePaid(address indexed token,address indexed asset,address referrer,uint256 referralCut,uint256 treasuryCut)',
  router: 'event SwapExecuted(address indexed sender,address indexed token,bool indexed isBuy,uint256 amountIn,uint256 amountOut,uint256 feeAmount)',
  referral: 'event ReferralPaid(address indexed referrer,address indexed swapper,address indexed token,bool isBuy,uint256 amount)',
  bundle: 'event BundleFeePaid(address indexed payer,uint256 amount,uint256 timestamp)',
};
const lower = (x: string) => x.toLowerCase();
async function graph(endpoint: string, query: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try { return await request(endpoint, query); }
    catch (error: any) {
      if (error?.response?.status !== 429 || attempt === 2) throw error;
      // This public index uses a 10-second rate-limit window.
      await new Promise(resolve => setTimeout(resolve, 11000));
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const c = config[options.chain];
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const getLogs: FetchOptions['getLogs'] = args => options.getLogs({ fromBlock: fromBlock + 1, toBlock, ...args });
  const dailyFees = options.createBalances(), dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();
  const allocate = (asset: string, creator: bigint, treasury: bigint, rewards = 0n, reinvest = 0n, label = 'Hook Fees') => {
    dailyFees.add(asset, creator + treasury + rewards + reinvest, label);
    dailySupplySideRevenue.add(asset, creator, 'Creator Fees');
    dailySupplySideRevenue.add(asset, rewards, 'Launch Token Rewards');
    dailySupplySideRevenue.add(asset, reinvest, 'Liquidity Reinvestment');
    dailyRevenue.add(asset, treasury, 'Fees To Treasury');
  };
  // Use the subgraph for immutable token/base metadata, never fee totals.
  const meta: any = await graph(c.endpoint, '{ _meta { block { number } hasIndexingErrors } }');
  if (meta._meta.hasIndexingErrors || meta._meta.block.number < toBlock) throw new Error('Sentry metadata index is behind the requested window');
  const tokenBase = new Map<string, string>();
  let cursor = '';
  while (true) {
    const data: any = await graph(c.endpoint, `{ tokens(first:1000,orderBy:id,orderDirection:asc,where:{id_gt:"${cursor}"},block:{number:${toBlock}}) { id baseToken } }`);
    data.tokens.forEach((t: any) => tokenBase.set(lower(t.id), lower(t.baseToken)));
    if (data.tokens.length < 1000) break;
    cursor = data.tokens[data.tokens.length - 1].id;
  }
  const baseOf = (token: string) => {
    const base = tokenBase.get(lower(token));
    if (!base) throw new Error(`Missing fee currency for ${token}`);
    return base;
  };
  const logs = (targets: string[], eventAbi: string) => targets.length ? getLogs({ targets, eventAbi }) : Promise.resolve([]);
  const groupedLogs = async (targets: string[], keys: (keyof typeof events)[]) => {
    const groups: Record<string, any[]> = {};
    for (const key of keys) groups[key] = targets.length ? await getLogs({ targets, eventAbi: events[key] }) : [];
    return groups;
  };
  // Count allocations once, not subsequent collections/distributions/compounding.
  const { app: apps, reflection: reflections, compound: compounds, stock: stocks, weth: weths } = await groupedLogs(c.hooks, ['app', 'reflection', 'compound', 'stock', 'weth']);
  // Verify hook recipients against the factory registry, including historical
  // windows. This excludes standalone markets without lifetime log scans.
  const poolIds = [...new Set<string>(compounds.map(a => lower(a.poolId)))];
  const compoundPools = new Map<string, any>();
  for (let i = 0; i < poolIds.length; i += 100) {
    const data: any = await graph(c.endpoint, `{ pools(first:1000,where:{id_in:${JSON.stringify(poolIds.slice(i, i + 100))}},block:{number:${toBlock}}) { id token { id baseToken } } }`);
    data.pools.forEach((p: any) => compoundPools.set(p.id, p.token));
  }
  const tokens: string[] = [...new Set<string>([...apps, ...reflections, ...stocks, ...weths].map(a => lower(a.token)).concat([...compoundPools.values()].map(p => p.id)))];
  const launched = new Set<string>();
  const liveFactories = c.factories.filter(f => f.version === 4 && f.block <= toBlock);
  for (const f of liveFactories) {
    const info = await options.api.multiCall({
      target: f.address,
      abi: 'function launches(address) view returns (address baseToken,address creator,address hook,int24 tickLower,int24 tickUpper)',
      calls: tokens.map(token => ({ params: [token] })),
    });
    info.forEach((p: any, i: number) => {
      if (p.creator === ADDRESSES.null) return;
      if (lower(p.baseToken) !== baseOf(tokens[i])) throw new Error('Indexed base asset differs from factory registry');
      launched.add(tokens[i]);
    });
  }
  const valid = (a: any) => launched.has(lower(a.token));
  for (const a of apps) if (valid(a)) allocate(baseOf(a.token), BigInt(a.creatorAmount), BigInt(a.treasuryAmount));
  for (const a of reflections) if (valid(a)) allocate(a.base, 0n, 0n, BigInt(a.amount));
  for (const a of compounds) {
    const p = compoundPools.get(lower(a.poolId));
    if (!p) throw new Error(`Missing reinvestment pool ${a.poolId}`);
    if (launched.has(p.id)) allocate(p.baseToken, 0n, 0n, 0n, BigInt(a.amount));
  }
  for (const a of [...stocks, ...weths]) if (valid(a)) {
    const reflection = BigInt(a.reflection);
    allocate(a.base ?? c.weth, BigInt(a.creatorCut), a.reflectionToTreasury ? reflection : 0n,
      BigInt(a.potCut) + BigInt(a.sinkCut) + (a.reflectionToTreasury ? 0n : reflection));
  }
  // Router fees are additional charges; router volume is never added to pool volume.
  const { router: routerFees, referral: referrals } = await groupedLogs(c.routers, ['router', 'referral']);
  const routerTotal = routerFees.reduce((s, a) => s + BigInt(a.feeAmount), 0n);
  const referralTotal = referrals.reduce((s, a) => s + BigInt(a.amount), 0n);
  if (referralTotal > routerTotal) throw new Error('Router referrals exceed fees');
  dailyFees.add(c.weth, routerTotal, 'Router Fees');
  dailyRevenue.add(c.weth, routerTotal - referralTotal, 'Router Fees To Treasury');
  dailySupplySideRevenue.add(c.weth, referralTotal, 'Referral Fees');
  if (options.chain === 'ink') {
    const nativeFees = await nativeRouterFees(options, '0x5275de614E06DbA10546171c1e6d2a30A87844b7', c.weth);
    dailyFees.add(c.weth, nativeFees, 'Router Fees');
    dailyRevenue.add(c.weth, nativeFees, 'Router Fees To Treasury');
    for (const a of await logs([c.stockRouter], events.inkRouter))
      allocate(c.weth, BigInt(a.creatorCut), 0n, BigInt(a.potCut) + BigInt(a.sinkCut), 0n, 'Router Fees');
  } else {
    for (const a of await logs([c.stockRouter], events.stockRouter)) {
      const referral = BigInt(a.referralCut), treasury = BigInt(a.treasuryCut);
      dailyFees.add(a.asset, referral + treasury, 'Router Fees');
      dailyRevenue.add(a.asset, treasury, 'Router Fees To Treasury');
      dailySupplySideRevenue.add(a.asset, referral, 'Referral Fees');
    }
  }
  for (const row of await collections(options, c.factories, c.vault, baseOf))
    allocate(row.asset, row.creator, row.gross - row.creator, 0n, 0n, 'Collected LP Fees');
  // BundleFeeCollector forwards the full native payment to the treasury.
  for (const a of await logs([c.bundleCollector], events.bundle)) {
    dailyFees.add(c.weth, a.amount, 'Bundle Fees');
    dailyRevenue.add(c.weth, a.amount, 'Bundle Fees To Treasury');
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const revenue = { 'Fees To Treasury': 'Explicit hook treasury allocations and actual collected LP fees less emitted creator payouts.', 'Router Fees To Treasury': 'Router fees less referrals, in the emitted fee asset.', 'Bundle Fees To Treasury': 'Full native payment emitted by BundleFeeCollector and forwarded to treasury.' };
const adapter: SimpleAdapter = {
  version: 2, pullHourly: true, fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, c]) => [chain, { start: c.start }])),
  doublecounted: true,
  methodology: {
    Fees: 'Fees allocated by Sentry launch hooks and fee routers in their actual payment assets, plus actual legacy LP fee collections in both pool currencies and bundle-buy service payments. Deferred skims are recognized when FeePaid is emitted on delivery. Legacy LP fees are recognized on collection because the factory events do not expose per-swap position accrual; uncollected balances are not estimated. Later dividend distribution and compounding are not counted again. Pool fees cover factory-deployed launches only; router app fees also cover third-party tokens traded through Sentry. Downstream treasury reallocations, independent non-launch hooks, direct custodial-wallet skims and third-party domain referrals are outside this contract-event scope.',
    Revenue: 'Explicit hook/router treasury amounts plus collected LP fees less emitted creator payouts. Community pots and growth-sink allocations are supply-side rewards, not Sentry treasury revenue.',
    ProtocolRevenue: 'Explicit hook/router treasury amounts plus collected LP fees less emitted creator payouts. Community pots and growth-sink allocations are supply-side rewards, not Sentry treasury revenue.',
    SupplySideRevenue: 'Creator allocations, launch-token dividends, community reward/growth allocations, liquidity reinvestment and router referrals. Legacy creator LP fees are actual payouts on the collection date; they may have accrued over earlier days. Assets without a DefiLlama price remain native-token balances, not invented USD values.',
  },
  breakdownMethodology: {
    Fees: { 'Hook Fees': 'AppFeePaid, ReflectionPaid, LpFeeAccrued and FeePaid allocations from launch hooks.', 'Router Fees': 'Emitted router fees plus the immutable Ink WETH router fee derived from actual buy payments/WETH withdrawals. Nested buys require verified call traces.', 'Collected LP Fees': 'Factory/vault FeesCollected events, excluding migration principal, in both actual currencies. Recognized on collection; accrued but uncollected fees are excluded.', 'Bundle Fees': 'Flat bundle-buy service payments, measured by BundleFeePaid rather than an assumed dollar price.' },
    Revenue: revenue, ProtocolRevenue: revenue,
    SupplySideRevenue: { 'Creator Fees': 'Exact hook/router creator allocations and emitted factory/vault creator payouts. No fixed or current split is applied to historical events.', 'Launch Token Rewards': 'Dividends and community pot/growth-sink allocations for launched-token ecosystems.', 'Liquidity Reinvestment': 'Hook fees earmarked for permanent launch-pool liquidity.', 'Referral Fees': 'Referral payments from router fees.' },
  },
};
export default adapter;
