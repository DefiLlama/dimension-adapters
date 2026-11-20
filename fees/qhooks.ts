import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// QHooks (https://qhooks.com): an ecosystem for launching and trading tokens, built for people and AI agents alike.
// Launches open Uniswap v4 pools whose hook is the QHooks launch contract itself; trades made through the QHooks
// terminal (website, bot and agent tools) go through QFeeRouter. Every amount below comes from on-chain events.

const LAUNCHED = 'event Launched(bytes32 indexed poolId, address indexed token, address indexed creator, address quote, string name, string symbol, string meta, uint8 style, address blocks, int24 startTick, int24 targetTick, uint256 supply, uint24 fee)';
const SETTLED = 'event Settled(uint256 indexed saleId, address indexed token, bytes32 indexed poolId, uint256 clearPrice, uint256 raised, uint256 sold, uint256 poolTokens)';
const PROTOCOL_FEE = 'event ProtocolFeeAccrued(bytes32 indexed poolId, address currency, uint256 amount)';
const SWAP = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';
const ROUTER_SWAPPED = 'event Swapped(address indexed trader, address indexed currencyIn, address indexed currencyOut, uint256 amountIn, uint256 amountOut, address feeCurrency, uint256 fee)';
const ROUTER_REFERRAL = 'event Referral(address indexed referrer, address indexed trader, address currency, uint256 amount)';
const CHAIN_VIEW = 'function chain() view returns ((address manager, address quote, bool wrapsNative, uint256 launchFee, address platform, int24 tick0, uint256 startCap))';

const SALE = '0x707d79c32bea8f9773a81569fbacc64ab0502044'; // QSaleLaunch (sale-first launches), also a hook
const ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff'; // QFeeRouter
const NATIVE = '0x0000000000000000000000000000000000000000';
const CASHBACK_SHARE = 30n; // percent of the terminal fee returned to the trader (QHOOKS holders on Robinhood Chain get 40)

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
  launchFee: bigint; // native launch fee in wei, used where a launch contract has no chain() view
  start: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', sale: 110156527, router: ROUTER, launchFee: 200000000000000n, start: '2026-11-07',
    launches: [
      ['0x023623568f41c032ec2f4bba368dbafc123160cc', 108170556],
      ['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 110156527],
      ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 110390517],
      ['0xefe39a5632212911fe8e3ddcb07f08e5e220e0cc', 110831000],
      ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 111223856],
    ],
  },
  [CHAIN.BASE]: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b', sale: 55185578, router: ROUTER, launchFee: 200000000000000n, start: '2026-11-09',
    launches: [['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 55185578], ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 55351284], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 55793671]],
  },
  [CHAIN.ARBITRUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', sale: 522677810, router: ROUTER, launchFee: 200000000000000n, start: '2026-11-09',
    launches: [['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 522677810], ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 522799540], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 523106870]],
  },
  [CHAIN.BSC]: {
    poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', sale: 132585433, router: ROUTER, launchFee: 700000000000000n, start: '2026-11-09',
    launches: [['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', 132585433], ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 132660352], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 132855010]],
  },
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90', sale: 26380174, router: ROUTER, launchFee: 200000000000000n, start: '2026-11-09',
    launches: [['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', 26380174], ['0x3fcf7693f799da31134970787f9f35578d0f60cc', 26387450]],
  },
  [CHAIN.ELYSIUM]: {
    poolManager: '0xe2e105d3f7209a9da11f83ccf3e7398a753823f1', sale: 3239822, router: '0xff208831ed6f0c4e3e3224effa45fae7906dc6c2', launchFee: 6000000000000000n, start: '2026-11-09',
    launches: [['0x8223f9ce8998fb436fc32bdf541cc34d668420cc', 3239822], ['0xc7faaf2e1b01e5e2cae4f967a020b49b290ca0cc', 3539046], ['0x9a9d37bca2e9874a1da1a1bab51f242a9d1ca0cc', 4331176]],
  },
  [CHAIN.MONAD]: {
    poolManager: '0x188d586ddcf52439676ca21a244753fa19f9ea8e', launchFee: 0n, start: '2026-11-11',
    launches: [['0x0f73962ed759b0abdb92cbecbc3ef2bf462a20cc', 121245205]],
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
      const amount = (input * fee) / 1_000_000n;
      dailyFees.add(currency, amount, LABEL.creator);
      dailySupplySideRevenue.add(currency, amount, LABEL.creator);
    }
  }

  // 3. Launch fee: a flat native fee per launch (the main pool of each launch carries the metadata).
  const launches = await options.getLogs({ targets: cfg.launches.map(([a]) => a), eventAbi: LAUNCHED, flatten: false });
  const views = await options.api.multiCall({ abi: CHAIN_VIEW, calls: cfg.launches.map(([a]) => a), permitFailure: true });
  launches.forEach((logs: any[], i: number) => {
    const fee = views[i]?.launchFee != null ? BigInt(views[i].launchFee) : cfg.launchFee;
    const count = BigInt(logs.filter((l: any) => String(l.meta ?? '') !== '').length);
    if (!fee || !count) return;
    dailyFees.addGasToken(fee * count, LABEL.launch);
    dailyRevenue.addGasToken(fee * count, LABEL.launch);
  });

  // 4. Terminal fee (QFeeRouter): up to 1% per trade; part goes back to the trader as cashback and, when one is bound,
  // 20% to the referrer; the rest is QHooks revenue.
  if (cfg.router) {
    const [swapped, referrals] = await Promise.all([
      options.getLogs({ target: cfg.router, eventAbi: ROUTER_SWAPPED }),
      options.getLogs({ target: cfg.router, eventAbi: ROUTER_REFERRAL }),
    ]);
    const referred: Record<string, bigint> = {};
    for (const r of referrals) referred[lower(r.currency)] = (referred[lower(r.currency)] ?? 0n) + BigInt(r.amount);
    const charged: Record<string, bigint> = {};
    for (const s of swapped) charged[lower(s.feeCurrency)] = (charged[lower(s.feeCurrency)] ?? 0n) + BigInt(s.fee);
    for (const [currency, fee] of Object.entries(charged)) {
      const cashback = (fee * CASHBACK_SHARE) / 100n, referral = referred[currency] ?? 0n;
      const add = (b: any, amount: bigint, label: string) => currency === NATIVE ? b.addGasToken(amount, label) : b.add(currency, amount, label);
      add(dailyFees, fee, LABEL.terminal);
      add(dailySupplySideRevenue, cashback, LABEL.cashback);
      if (referral) add(dailySupplySideRevenue, referral, LABEL.referral);
      add(dailyRevenue, fee - cashback - referral, LABEL.terminal);
    }
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, c]) => [chain, { start: c.start }])),
  methodology: {
    Fees: 'Fees paid by traders and launchers on QHooks: the protocol and creator shares of the swap fee in QHooks launch pools (Uniswap v4 pools whose hook is a QHooks launch contract), the flat launch fee, and the QHooks terminal fee charged by QFeeRouter.',
    UserFees: 'Same as Fees.',
    Revenue: 'The QHooks protocol fee in launch pools (one fifth of the pool fee), launch fees, and the terminal fee after trader cashback and referral rewards.',
    ProtocolRevenue: 'Same as Revenue; it goes to the QHooks platform wallets.',
    SupplySideRevenue: 'Launch pool creator fees (the pool LP fee, earned by the launch creator), terminal cashback returned to traders (30%; QHOOKS holders on Robinhood Chain get 40%, counted here at 30%), and referral rewards.',
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
      [LABEL.cashback]: 'Part of the terminal fee returned to the trader.',
      [LABEL.referral]: 'Part of the terminal fee paid to the referrer, from Referral.',
    },
  },
};

export default adapter;
