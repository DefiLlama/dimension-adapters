import { ChainApi } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// QHooks (https://qhooks.com): an ecosystem for launching and trading tokens, built for people and AI agents alike.
// Launches open Uniswap v4 pools whose hook is the QHooks launch contract itself; trades made through the QHooks
// terminal (website, bot and agent tools) go through QFeeRouter. Every amount below comes from on-chain events.

const LAUNCHED = 'event Launched(bytes32 indexed poolId, address indexed token, address indexed creator, address quote, string name, string symbol, string meta, uint8 style, address blocks, int24 startTick, int24 targetTick, uint256 supply, uint24 fee)';
const SETTLED = 'event Settled(uint256 indexed saleId, address indexed token, bytes32 indexed poolId, uint256 clearPrice, uint256 raised, uint256 sold, uint256 poolTokens)';
const PROTOCOL_FEE = 'event ProtocolFeeAccrued(bytes32 indexed poolId, address currency, uint256 amount)';
const SWAP = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
// keccak256('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'), the Uniswap v4 PoolManager Swap event
const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';
const ROUTER_SWAPPED = 'event Swapped(address indexed trader, address indexed currencyIn, address indexed currencyOut, uint256 amountIn, uint256 amountOut, address feeCurrency, uint256 fee)';
const ROUTER_REFERRAL = 'event Referral(address indexed referrer, address indexed trader, address currency, uint256 amount)';
const IS_HOLDER = 'function isHolder(address trader) view returns (bool)';
// Every QHooks launch contract (and QSaleLaunch) exposes chain(): a constant per-chain table compiled into the contract
// (no setter), so it is read at the latest block; launchFee is the flat native fee charged per launch.
const CHAIN_VIEW = 'function chain() view returns ((address manager, address quote, bool wrapsNative, uint256 launchFee, address platform, int24 tick0, uint256 startCap))';

// Addresses: launch contracts are listed in the QHooks contract directory (https://qhooks.com/contracts,
// https://qhooks.com/contracts-directory.json); QFeeRouter is FEE_ROUTER in the public SDK (https://qhooks.com/sdk/qhooks.mjs).
const SALE = '0x707d79c32bea8f9773a81569fbacc64ab0502044'; // QSaleLaunch (sale-first launches), also a hook
const ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff'; // QFeeRouter
const NATIVE = '0x0000000000000000000000000000000000000000';
// QFeeRouter constants (CASHBACK_PCT, HOLDER_BONUS_PCT, REFERRAL_PCT): the trader gets 30% of the terminal fee back,
// 40% when the Robinhood Chain flywheel's isHolder(trader) is true (the router asks it only on Robinhood Chain); a bound
// referrer gets 20%; the router pushes the rest to the platform in the same call.
const CASHBACK_PCT = 30n, HOLDER_CASHBACK_PCT = 40n;
const FLYWHEEL = '0xb85e67cf7728572033a9d36aee3218dadf85baa2'; // QFlywheel on Robinhood Chain (router platform + holder check)

const LABEL = {
  protocol: 'Launch pool protocol fees',
  creator: 'Launch pool creator fees',
  launch: 'Launch fees',
  terminal: 'Terminal trading fees',
  cashback: 'Trader cashback',
  referral: 'Referral rewards',
};

type ChainConfig = {
  poolManager: string;
  launches: [string, number][]; // launch contract, deploy block (or earlier)
  sale?: number; // QSaleLaunch lower-bound block
  router?: string;
  start: string; // first observed QHooks fee event on the chain (see config)

};

// poolManager: the chain's Uniswap v4 PoolManager (https://docs.uniswap.org/contracts/v4/deployments; the same addresses as
// dexs/uniswap-v4.ts). launches: [launch contract, its deployment block]; sale: QSaleLaunch's deployment block there.
// start: the day of the first QHooks fee event observed on the chain (first launch or first QFeeRouter trade). Robinhood
// Chain: first launch 2026-11-08; Base: first router trade 2026-11-05; Ethereum: 2026-11-04; Elysium: first launch
// 2026-11-09. Arbitrum has none yet and BNB Chain's public RPCs cannot scan the range, so both use 2026-11-04, the
// earliest router trade on any chain (an earlier start only adds empty days).
const config: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', sale: 110156527, router: ROUTER, start: '2026-11-08',
    launches: [
      ['0x023623568f41c032ec2f4bba368dbafc123160cc', 108170556],
      ['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 110156527],
      ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 110390517],
      ['0xefe39a5632212911fe8e3ddcb07f08e5e220e0cc', 110831000],
      ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 111223856],
    ],
  },
  [CHAIN.BASE]: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b', sale: 55185578, router: ROUTER, start: '2026-11-05',
    launches: [['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 55185578], ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 55351284], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 55793671]],
  },
  [CHAIN.ARBITRUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', sale: 522677810, router: ROUTER, start: '2026-11-04',
    launches: [['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 522677810], ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 522799540], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 523106870]],
  },
  [CHAIN.BSC]: {
    poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', sale: 132585433, router: ROUTER, start: '2026-11-04',
    launches: [['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 132585433], ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 132660352], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 132855010]],
  },
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90', sale: 26380174, router: ROUTER, start: '2026-11-04',
    launches: [['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 26380174], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 26387450]],
  },
  [CHAIN.ELYSIUM]: {
    poolManager: '0xe2e105d3f7209a9da11f83ccf3e7398a753823f1', sale: 3239822, router: '0xff208831ed6f0c4e3e3224effa45fae7906dc6c2', start: '2026-11-09',
    launches: [['0x8223f9ce8998fb436fc32bdf541cc34d668420cc', 3239822], ['0xc7faaf2e1b01e5e2cae4f967a020b49b290ca0cc', 3539046], ['0x9a9d37bca2e9874a1da1a1bab51f242a9d1ca0cc', 4331176]],
  },
};

const lower = (a: string) => String(a).toLowerCase();
const sortPair = (a: string, b: string) => (BigInt(lower(a)) < BigInt(lower(b)) ? [lower(a), lower(b)] : [lower(b), lower(a)]);

// Every QHooks pool with its two currencies, from the launch contracts' history (cached).
async function qhooksPools(options: FetchOptions, cfg: ChainConfig) {
  const pools = new Map<string, [string, string]>();
  const toBlock = await options.getToBlock();
  for (const [target, fromBlock] of cfg.launches) {
    const logs = await options.getLogs({ target, eventAbi: LAUNCHED, fromBlock, toBlock, cacheInCloud: true });
    for (const l of logs) pools.set(lower(l.poolId), sortPair(l.token, l.quote) as [string, string]);
  }
  if (cfg.sale) {
    const settled = await options.getLogs({ target: SALE, eventAbi: SETTLED, fromBlock: cfg.sale, toBlock, cacheInCloud: true });
    const ids = settled.map((l: any) => lower(l.poolId)).filter((id: string) => !pools.has(id));
    if (ids.length) {
      // sale pools: the quote is the chain's launch quote, read from the sale contract's chain() view
      const view = await options.api.call({ target: SALE, abi: CHAIN_VIEW, permitFailure: true });
      settled.forEach((l: any) => { if (view?.quote && !pools.has(lower(l.poolId))) pools.set(lower(l.poolId), sortPair(l.token, view.quote) as [string, string]); });
    }
  }
  return pools;
}

const fetch = async (options: FetchOptions) => {
  const cfg = config[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const hooks = [...cfg.launches.map(([a]) => a), ...(cfg.sale ? [SALE] : [])];

  // 1. Hook protocol fee: one fifth of the pool fee, charged in afterSwap and sent to the QHooks platform wallet.
  const protocolFees = await options.getLogs({ targets: hooks, eventAbi: PROTOCOL_FEE });
  for (const l of protocolFees) {
    dailyFees.add(l.currency, l.amount, LABEL.protocol);
    dailyRevenue.add(l.currency, l.amount, LABEL.protocol);
  }

  // 2. Creator fee: the pool's LP fee on the swap input, earned by the launch's creator through the locked launch position.
  const pools = await qhooksPools(options, cfg);
  const ids = [...pools.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const swaps = await options.getLogs({ target: cfg.poolManager, eventAbi: SWAP, topics: [SWAP_TOPIC, ids.slice(i, i + 50)] as any, entireLog: false } as any);
    for (const s of swaps) {
      const pair = pools.get(lower(s.id));
      if (!pair) continue;
      const a0 = BigInt(s.amount0), a1 = BigInt(s.amount1), fee = BigInt(s.fee);
      // v4 swap deltas are from the swapper's side: the negative amount is what the swapper paid in
      const [currency, input] = a0 < 0n ? [pair[0], -a0] : [pair[1], -a1];
      if (input <= 0n || fee === 0n) continue;
      // Swap.fee is the LP fee in pips (hundredths of a bip; 1_000_000 = 100%), per v4-core IPoolManager's Swap event
      const amount = (input * fee) / 1_000_000n;
      dailyFees.add(currency, amount, LABEL.creator);
      dailySupplySideRevenue.add(currency, amount, LABEL.creator);
    }
  }

  // 3. Launch fee: a flat native fee per launch (the main pool of each launch carries the metadata).
  const launches = await options.getLogs({ targets: cfg.launches.map(([a]) => a), eventAbi: LAUNCHED, flatten: false });
  const latest = new ChainApi({ chain: options.chain });
  const views = await latest.multiCall({ abi: CHAIN_VIEW, calls: cfg.launches.map(([a]) => a) });
  launches.forEach((logs: any[], i: number) => {
    const fee = BigInt(views[i].launchFee);
    const count = BigInt(logs.filter((l: any) => String(l.meta ?? '') !== '').length);
    if (!fee || !count) return;
    dailyFees.addGasToken(fee * count, LABEL.launch);
    dailyRevenue.addGasToken(fee * count, LABEL.launch);
  });

  // 4. Terminal fee (QFeeRouter): up to 1% per trade, taken in one currency (feeCurrency). Per trade the router credits
  // the trader cashback (30%, 40% for Robinhood Chain QHOOKS holders), credits the bound referrer 20% and emits
  // Referral(referrer, trader, feeCurrency, amount), then pushes the rest to the platform; revenue is that rest.
  if (cfg.router) {
    const [swapped, referrals] = await Promise.all([
      options.getLogs({ target: cfg.router, eventAbi: ROUTER_SWAPPED }),
      options.getLogs({ target: cfg.router, eventAbi: ROUTER_REFERRAL }),
    ]);
    // Holder status per unique trader (Robinhood Chain only, as in the router): read at the end of the window; where that
    // block's state is not available (public non-archive RPCs), read at the latest block. For hourly runs the two are
    // minutes apart; a backfill of older windows uses the current status.
    const holder = new Map<string, boolean>();
    if (options.chain === CHAIN.ROBINHOOD && swapped.length) {
      const traders = [...new Set(swapped.map((s: any) => lower(s.trader)))];
      const atEnd = await options.api.multiCall({ abi: IS_HOLDER, target: FLYWHEEL, calls: traders, permitFailure: true });
      const missing = traders.filter((_, i) => typeof atEnd[i] !== 'boolean');
      const now = missing.length ? await new ChainApi({ chain: options.chain }).multiCall({ abi: IS_HOLDER, target: FLYWHEEL, calls: missing }) : [];
      traders.forEach((t, i) => holder.set(t, typeof atEnd[i] === 'boolean' ? atEnd[i] : now[missing.indexOf(t)] === true));
    }
    const charged: Record<string, bigint> = {}, back: Record<string, bigint> = {}, referred: Record<string, bigint> = {};
    for (const s of swapped) {
      const c = lower(s.feeCurrency), fee = BigInt(s.fee);
      charged[c] = (charged[c] ?? 0n) + fee;
      back[c] = (back[c] ?? 0n) + (fee * (holder.get(lower(s.trader)) ? HOLDER_CASHBACK_PCT : CASHBACK_PCT)) / 100n;
    }
    for (const r of referrals) referred[lower(r.currency)] = (referred[lower(r.currency)] ?? 0n) + BigInt(r.amount);
    // Walk every currency seen in either event. Referral.currency is the trade's feeCurrency and is emitted in the same
    // transaction as its Swapped (same block, same window), and 20% + 40% < 100%, so revenue cannot go below zero; the
    // clamp only guards against a malformed event.
    for (const currency of new Set([...Object.keys(charged), ...Object.keys(referred)])) {
      const fee = charged[currency] ?? 0n, cashback = back[currency] ?? 0n, referral = referred[currency] ?? 0n;
      const add = (b: any, amount: bigint, label: string) => currency === NATIVE ? b.addGasToken(amount, label) : b.add(currency, amount, label);
      if (fee) {
        add(dailyFees, fee, LABEL.terminal);
        add(dailySupplySideRevenue, cashback, LABEL.cashback);
      }
      if (referral) add(dailySupplySideRevenue, referral, LABEL.referral);
      const rest = fee - cashback - referral;
      if (rest > 0n) add(dailyRevenue, rest, LABEL.terminal);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, c]) => [chain, { start: c.start }])),
  methodology: {
    Fees: 'Fees paid by traders and launchers on QHooks: the protocol and creator shares of the swap fee in QHooks launch pools (Uniswap v4 pools whose hook is a QHooks launch contract), the flat launch fee, and the QHooks terminal fee charged by QFeeRouter.',
    Revenue: 'The QHooks protocol fee in launch pools (one fifth of the pool fee), launch fees, and the terminal fee after trader cashback and referral rewards.',
    ProtocolRevenue: 'Same as Revenue; it goes to the QHooks platform wallets.',
    SupplySideRevenue: 'Launch pool creator fees (the pool LP fee, earned by the launch creator), terminal cashback returned to traders (30% of the terminal fee; 40% on Robinhood Chain for QHOOKS holders, read from isHolder(trader) on the QHooks flywheel at the end of each period, which the router itself checks per trade), and referral rewards (20%, from Referral events emitted by the router).',
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.protocol]: 'One fifth of the pool fee on each swap in a QHooks launch pool, from ProtocolFeeAccrued.',
      [LABEL.creator]: 'The pool LP fee on each swap input in a QHooks launch pool, from the Uniswap v4 PoolManager Swap event.',
      [LABEL.launch]: 'Flat native fee paid with each launch.',
      [LABEL.terminal]: 'Fee charged by QFeeRouter on trades made through the QHooks terminal, from Swapped.',
    },
    Revenue: {
      [LABEL.protocol]: 'Protocol share of launch pool fees.',
      [LABEL.launch]: 'Launch fees.',
      [LABEL.terminal]: 'Terminal fee after cashback and referral rewards.',
    },
    SupplySideRevenue: {
      [LABEL.creator]: 'Pool LP fees earned by launch creators.',
      [LABEL.cashback]: 'Part of the terminal fee returned to the trader: 30%, or 40% for Robinhood Chain QHOOKS holders (flywheel isHolder at the end of the period).',
      [LABEL.referral]: 'Part of the terminal fee paid to the referrer, from Referral.',
    },
  },
};

export default adapter;
