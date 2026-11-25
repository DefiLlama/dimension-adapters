import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import ADDRESSES from '../helpers/coreAssets.json';
import { queryDuneSql } from '../helpers/dune';

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
// Every QHooks launch contract (and QSaleLaunch) exposes chain(): per-chain constants; launchFee is the flat native fee per launch.
const CHAIN_VIEW = 'function chain() view returns ((address manager, address quote, bool wrapsNative, uint256 launchFee, address platform, int24 tick0, uint256 startCap))';

// Addresses: launch contracts are listed in the QHooks contract directory (https://qhooks.com/contracts,
// https://qhooks.com/contracts-directory.json); QFeeRouter is FEE_ROUTER in the public SDK (https://qhooks.com/sdk/qhooks.mjs).
const SALE = '0x707d79c32bea8f9773a81569fbacc64ab0502044'; // QSaleLaunch (sale-first launches), also a hook
const ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff'; // QFeeRouter
// QFeeRouter constants (CASHBACK_PCT, HOLDER_BONUS_PCT, REFERRAL_PCT): the trader gets 30% of the terminal fee back,
// 40% when the Robinhood Chain flywheel's isHolder(trader) is true (the router asks it only on Robinhood Chain); a bound
// referrer gets 20%; the router pushes the rest to the platform in the same call.
const CASHBACK_PCT = 30n, HOLDER_CASHBACK_PCT = 40n;
const FLYWHEEL = '0xb85e67cf7728572033a9d36aee3218dadf85baa2'; // QFlywheel on Robinhood Chain (router platform + holder check)

const SOLANA_DBC_CONFIG = 'AFBWuEXpP78Sgk6BZuHc2eHNJKdabFwrGk57kscvurmd';
const SOLANA_START = '2026-11-11';
const SOLANA_LABEL = {
  fees: 'Solana DBC Trading Fees',
  revenue: 'Solana DBC Fees To QHooks',
  creators: 'Solana DBC Fees To Creators',
  meteora: 'Solana DBC Protocol Fees',
  referrals: 'Solana DBC Referral Fees',
};

const LABEL = {
  swap: 'Launch pool swap fees',
  protocol: 'Launch pool protocol fees',
  creator: 'Launch pool creator fees',
  launch: 'Launch fees',
  terminal: 'Terminal trading fees',
  cashback: 'Trader cashback',
  referral: 'Referral rewards',
  buyback: 'QHOOKS buyback',
};

// Robinhood Chain: every revenue line is paid to QFlywheel (the router's platform() and each launch contract's
// chain().platform; QSaleLaunch names it as a constant). QFlywheel keeps RESERVE_PCT = 25 (a constant) of what it receives
// in its buyback currency (WETH, or ETH, which it wraps) to buy QHOOKS, half burned and half to the Safe; everything else
// goes to the Safe. That 25% is holders revenue.
const RH_WETH = ADDRESSES.robinhood.WETH;
const BUYBACK_PCT = 25n;

type ChainConfig = {
  poolManager: string;
  launches: string[];
  fromBlock: number; // first launch contract deploy block
  sale?: number; // QSaleLaunch lower-bound block
  router?: string;
  start: string; // first observed QHooks fee event on the chain (see chainConfig)
};

// poolManager: the chain's Uniswap v4 PoolManager (https://docs.uniswap.org/contracts/v4/deployments; the same addresses as
// dexs/uniswap-v4.ts). launches: launch contracts; fromBlock: the first one's deployment block; sale: QSaleLaunch's deployment block there.
// start: the day of the first QHooks fee event observed on the chain (first launch or first QFeeRouter trade). Robinhood
// Chain: first launch 2026-11-08; Base: first router trade 2026-11-05; Ethereum: 2026-11-04; Elysium: first launch
// 2026-11-09. Arbitrum has none yet and BNB Chain's public RPCs cannot scan the range, so both use 2026-11-04, the
// earliest router trade on any chain (an earlier start only adds empty days).
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', fromBlock: 108170556, sale: 110156527, router: ROUTER, start: '2026-11-08',
    launches: [
      '0x023623568f41c032ec2f4bba368dbafc123160cc',
      '0xfb5a559886fccba6400cc52905ba3aa4658ba0cc',
      '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc',
      '0xefe39a5632212911fe8e3ddcb07f08e5e220e0cc',
      '0x3fcf7693f799da31134970787f9f35578d0f60cc',
    ],
  },
  [CHAIN.BASE]: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b', fromBlock: 55185578, sale: 55185578, router: ROUTER, start: '2026-11-05',
    launches: ['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', '0x3fcf7693f799da31134970787f9f35578d0f60cc'],
  },
  [CHAIN.ARBITRUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', fromBlock: 522677810, sale: 522677810, router: ROUTER, start: '2026-11-04',
    launches: ['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', '0x3fcf7693f799da31134970787f9f35578d0f60cc'],
  },
  [CHAIN.BSC]: {
    poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', fromBlock: 132585433, sale: 132585433, router: ROUTER, start: '2026-11-04',
    launches: ['0xfb5a559886fccba6400cc52905ba3aa4658ba0cc', '0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', '0x3fcf7693f799da31134970787f9f35578d0f60cc'],
  },
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90', fromBlock: 26380174, sale: 26380174, router: ROUTER, start: '2026-11-04',
    launches: ['0x34ac8c4e6ca3d5b70a5321b648d0db9451c060cc', '0x3fcf7693f799da31134970787f9f35578d0f60cc'],
  },
  [CHAIN.ELYSIUM]: {
    poolManager: '0xe2e105d3f7209a9da11f83ccf3e7398a753823f1', fromBlock: 3239822, sale: 3239822, router: '0xff208831ed6f0c4e3e3224effa45fae7906dc6c2', start: '2026-11-09',
    launches: ['0x8223f9ce8998fb436fc32bdf541cc34d668420cc', '0xc7faaf2e1b01e5e2cae4f967a020b49b290ca0cc', '0x9a9d37bca2e9874a1da1a1bab51f242a9d1ca0cc'],
  },
};

const lower = (a: string) => String(a).toLowerCase();
const sortPair = (a: string, b: string) => (BigInt(lower(a)) < BigInt(lower(b)) ? [lower(a), lower(b)] : [lower(b), lower(a)]);

// Every QHooks pool with its two currencies, from the launch contracts' history (cached).
async function qhooksPools(options: FetchOptions, cfg: ChainConfig) {
  const pools = new Map<string, [string, string]>();
  const toBlock = await options.getToBlock();
  const logs = await options.getLogs({ targets: cfg.launches, eventAbi: LAUNCHED, fromBlock: cfg.fromBlock, toBlock, cacheInCloud: true });
  for (const l of logs) pools.set(lower(l.poolId), sortPair(l.token, l.quote) as [string, string]);
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
  const cfg = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    const rows: { quote_mint: string; trading_fee: number; protocol_fee: number; referral_fee: number; partner_fee: number; creator_fee: number }[] = await queryDuneSql(options, `
      WITH config AS (
        SELECT config, quote_mint,
          COALESCE(
            CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_trading_fee_percentage') AS INTEGER),
            CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INTEGER), 0
          ) AS creator_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
        WHERE config = '${SOLANA_DBC_CONFIG}'
      ), swaps AS (
        SELECT c.quote_mint, c.creator_pct,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2 s
        JOIN config c ON c.config = s.config
        WHERE s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
          AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time < from_unixtime(${options.endTimestamp})
      )
      SELECT quote_mint,
        SUM(COALESCE(trading_fee, 0)) AS trading_fee,
        SUM(COALESCE(protocol_fee, 0)) AS protocol_fee,
        SUM(COALESCE(referral_fee, 0)) AS referral_fee,
        SUM(FLOOR(COALESCE(trading_fee, 0) * (100 - creator_pct) / 100)) AS partner_fee,
        SUM(FLOOR(COALESCE(trading_fee, 0) * creator_pct / 100)) AS creator_fee
      FROM swaps GROUP BY quote_mint
    `);
    for (const row of rows) {
      const trading = Number(row.trading_fee ?? 0), protocol = Number(row.protocol_fee ?? 0), referral = Number(row.referral_fee ?? 0);
      const partner = Number(row.partner_fee ?? 0), creator = Number(row.creator_fee ?? 0);
      dailyFees.add(row.quote_mint, trading + protocol + referral, SOLANA_LABEL.fees);
      dailyRevenue.add(row.quote_mint, partner, SOLANA_LABEL.revenue);
      dailyProtocolRevenue.add(row.quote_mint, partner, SOLANA_LABEL.revenue);
      dailySupplySideRevenue.add(row.quote_mint, creator, SOLANA_LABEL.creators);
      dailySupplySideRevenue.add(row.quote_mint, protocol, SOLANA_LABEL.meteora);
      dailySupplySideRevenue.add(row.quote_mint, referral, SOLANA_LABEL.referrals);
    }
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  }
  const revenue = (currency: string, amount: bigint, label: string) => {
    const c = lower(currency), native = c === ADDRESSES.null;
    const add = (b: any, a: bigint, l: string) => { if (a > 0n) native ? b.addGasToken(a, l) : b.add(c, a, l); };
    const toHolders = options.chain === CHAIN.ROBINHOOD && (native || c === RH_WETH) ? (amount * BUYBACK_PCT) / 100n : 0n;
    add(dailyRevenue, amount, label);
    add(dailyHoldersRevenue, toHolders, LABEL.buyback);
    add(dailyProtocolRevenue, amount - toHolders, label);
  };
  const hooks = [...cfg.launches, ...(cfg.sale ? [SALE] : [])];

  // 1. Hook protocol fee: one fifth of the pool fee, charged in afterSwap and sent to the QHooks platform wallet.
  const protocolFees = await options.getLogs({ targets: hooks, eventAbi: PROTOCOL_FEE });
  for (const l of protocolFees) {
    dailyFees.add(l.currency, l.amount, LABEL.swap);
    revenue(l.currency, BigInt(l.amount), LABEL.protocol);
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
      dailyFees.add(currency, amount, LABEL.swap);
      dailySupplySideRevenue.add(currency, amount, LABEL.creator);
    }
  }

  // 3. Launch fee: a flat native fee per launch (the main pool of each launch carries the metadata).
  const launches = await options.getLogs({ targets: cfg.launches, eventAbi: LAUNCHED, flatten: false });
  // permitFailure: launch contracts deployed after the window end have no state yet
  const views = await options.api.multiCall({ abi: CHAIN_VIEW, calls: cfg.launches, permitFailure: true });
  launches.forEach((logs: any[], i: number) => {
    const fee = BigInt(views[i]?.launchFee ?? 0);
    const count = BigInt(logs.filter((l: any) => String(l.meta ?? '') !== '').length);
    if (!fee || !count) return;
    dailyFees.addGasToken(fee * count, LABEL.launch);
    revenue(ADDRESSES.null, fee * count, LABEL.launch);
  });

  // 4. Terminal fee (QFeeRouter): up to 1% per trade, taken in one currency (feeCurrency). Per trade the router credits
  // the trader cashback (30%, 40% for Robinhood Chain QHOOKS holders), credits the bound referrer 20% and emits
  // Referral(referrer, trader, feeCurrency, amount), then pushes the rest to the platform; revenue is that rest.
  if (cfg.router) {
    const [swapped, referrals] = await Promise.all([
      options.getLogs({ target: cfg.router, eventAbi: ROUTER_SWAPPED }),
      options.getLogs({ target: cfg.router, eventAbi: ROUTER_REFERRAL }),
    ]);
    // Holder status per trader (Robinhood Chain only, as in the router), read at the end of the window
    const holder = new Map<string, boolean>();
    if (options.chain === CHAIN.ROBINHOOD && swapped.length) {
      const traders = [...new Set(swapped.map((s: any) => lower(s.trader)))];
      const isHolder = await options.api.multiCall({ abi: IS_HOLDER, target: FLYWHEEL, calls: traders });
      traders.forEach((t, i) => holder.set(t, isHolder[i]));
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
      const add = (b: any, amount: bigint, label: string) => currency === ADDRESSES.null ? b.addGasToken(amount, label) : b.add(currency, amount, label);
      if (fee) {
        add(dailyFees, fee, LABEL.terminal);
        add(dailySupplySideRevenue, cashback, LABEL.cashback);
      }
      if (referral) add(dailySupplySideRevenue, referral, LABEL.referral);
      const rest = fee - cashback - referral;
      if (rest > 0n) revenue(currency, rest, LABEL.terminal);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: { ...chainConfig, [CHAIN.SOLANA]: { start: SOLANA_START } },
  doublecounted: true, // launch pool LP fees are also counted by the Uniswap v4 adapter
  methodology: {
    Fees: 'Swap fees paid by traders in QHooks launch pools (Uniswap v4 on EVM and pre-graduation Meteora DBC pools on Solana), flat fees paid to launch a token, and the QHooks terminal fee (up to 1%) on trades made through the QHooks website, bot and agent tools.',
    Revenue: 'The QHooks share of launch-pool fees (the configured partner share on Solana DBC and the protocol share on EVM), launch fees, and the terminal fee left after trader cashback and referral rewards.',
    ProtocolRevenue: 'The protocol share of launch pool swap fees, launch fees, and the terminal fee left after trader cashback and referral rewards, sent to the QHooks platform wallets, less the Robinhood Chain QHOOKS buyback share.',
    HoldersRevenue: 'On Robinhood Chain all revenue goes to QFlywheel, which keeps a fixed 25% of what it receives in WETH or ETH to buy back QHOOKS (half burned, half to the QHooks Safe). Counted when the fee is received.',
    SupplySideRevenue: 'Launch pool LP fees earned by token creators, Meteora protocol and referral fees on Solana DBC swaps, the share of the terminal fee returned to traders as cashback (30%, or 40% for QHOOKS holders on Robinhood Chain), and referral rewards (20% of the terminal fee) paid to referrers.',
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.swap]: 'Swap fees paid by traders in QHooks launch pools: the protocol fee (one fifth of the pool fee) and the LP fee earned by the token creator.',
      [LABEL.launch]: 'Flat fee in the chain\'s native token paid for each token launch.',
      [LABEL.terminal]: 'Terminal fee (up to 1%) on trades made through the QHooks website, bot and agent tools.',
    },
    Revenue: {
      [LABEL.protocol]: 'Protocol share of swap fees in QHooks launch pools.',
      [LABEL.launch]: 'Flat fees paid for token launches.',
      [LABEL.terminal]: 'Terminal fee left after trader cashback and referral rewards.',
    },
    ProtocolRevenue: {
      [LABEL.protocol]: 'Protocol share of swap fees in QHooks launch pools, sent to the QHooks platform wallets.',
      [LABEL.launch]: 'Flat fees paid for token launches, sent to the QHooks platform wallets.',
      [LABEL.terminal]: 'Terminal fee left after trader cashback and referral rewards, sent to the QHooks platform wallets.',
    },
    HoldersRevenue: {
      [LABEL.buyback]: '25% of the WETH/ETH revenue QFlywheel receives on Robinhood Chain, spent buying back QHOOKS (half burned, half to the QHooks Safe).',
    },
    SupplySideRevenue: {
      [LABEL.creator]: 'LP fees on launch pool swaps, earned by token creators through the locked launch position.',
      [LABEL.cashback]: 'Share of the terminal fee returned to the trader: 30%, or 40% for QHOOKS holders on Robinhood Chain (holder status at the end of the period).',
      [LABEL.referral]: 'Share of the terminal fee (20%) paid to the trader\'s referrer, when one is set.',
    },
  },
  dependencies: [Dependencies.DUNE],
  start: SOLANA_START,
};

export default adapter;
