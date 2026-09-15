import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { nullAddress } from "../helpers/token";

/**
 * Iter (formerly Standard) - fully onchain CLOB exchange with band liquidity pools,
 * stop orders and a token launchpad. Contracts: https://github.com/iter-cx/iter-monorepo
 *
 * Every chain needs the MatchingEngine. The other contracts are read when configured:
 *   stopOrderEngine - StopOrderEngine; it matches triggered stop orders itself and emits
 *                     the same OrderMatched event as the engine
 *   swapRouter      - BandSwapRouter; the only external entry point into band pool swaps
 *   bandPoolFactory - BandPoolFactory; needed to know which addresses are band pools
 *   assetGenerator  - AssetGenerator; the launchpad that charges a fee per token launch
 */
interface ChainConfig {
  matchingEngine: string;
  stopOrderEngine?: string;
  swapRouter?: string;
  bandPoolFactory?: string;
  assetGenerator?: string;
  start: string;
}

// Addresses come from packages/deployments/deployments.json in iter-monorepo.
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ARC_TESTNET]: {
    matchingEngine: '0xD44e3b8bdDC46E112C4eB99EdcF08FF88cf4b0Da',
    stopOrderEngine: '0x0e7091a9cb0520DA70F947aF67afc3Cb12807341',
    swapRouter: '0x3d752EE5a67409eAf7809fabB3301506ade67110',
    bandPoolFactory: '0x1844A8bCDcaa53B54a873220E4Ef7a4a53eF73E5',
    assetGenerator: '0x2a34500cFe38Bd401320E9D8f247E20C5FD5d355',
    start: '2026-09-14',
  },
  [CHAIN.RISE_TESTNET]: {
    matchingEngine: '0x631eb12F60698C869a192217C0055CCb660ff9c1',
    stopOrderEngine: '0xBCBFD284c037bdCf87c494b6Cd92029527b60e65',
    swapRouter: '0xb7C0dEFbB427Be3155120EEdCAc25F8df5B4329d',
    bandPoolFactory: '0xA3b41c0F07533B3807E07A688556A6DD68799c8c',
    assetGenerator: '0x07B43f1e64fE740c2f38e23Ee2cb88c1539Cf4b7',
    start: '2026-09-07',
  },
}

// Fee rates, prices and pool fee shares are all scaled by MatchingEngine.DENOM.
const DENOM = 1e8;

const ABI = {
  orderbookFactory: 'address:orderbookFactory',
  getBaseQuote: 'function getBaseQuote() view returns (address base, address quote)',
  getPool: 'address:getPool',
  poolFeeShare: 'uint32:poolFeeShare',
  feeOf: 'function feeOf(address base, address quote, address account, bool isMaker) view returns (uint32)',
  effectiveFeeRate: 'function effectiveFeeRate(uint8 band, uint256 engineRate) view returns (uint256)',
  allPoolsLength: 'uint256:allPoolsLength',
  allPools: 'function allPools(uint256) view returns (address)',
  launchFee: 'uint256:launchFee',
  paymentOptions: 'function paymentOptions(address token) view returns (bool enabled, uint256 amount)',
}

const EVENT = {
  // Emitted per fill by MatchingEngine and StopOrderEngine. baseFee/quoteFee are the fees
  // taken from the two legs of that fill; on the current generation only the taker pays.
  orderMatched: 'event OrderMatched(address pair, uint16 orderHistoryId, uint256 id, bool isBid, uint256 price, uint256 total, bool clear, (address sender, address owner, uint256 baseAmount, uint256 quoteAmount, uint256 baseFee, uint256 quoteFee, uint64 tradeId) orderMatch)',
  // Every router swap against a band pool. amountOut is net of the fee, which the pool
  // charges on the output token.
  bandSwapRouted: 'event BandSwapRouted(address indexed pool, address indexed taker, address indexed recipient, bool quoteToBase, uint256 amountIn, uint256 amountOut, uint256 matchedPrice)',
  // A market order's unfilled remainder swapped into the pair's band pool by the engine.
  // It bypasses the router, so BandSwapRouted is not emitted for it.
  remainderRouted: 'event RemainderRoutedToPool(address indexed pair, address indexed recipient, uint256 spent, uint256 received)',
  // Emitted right before RemainderRoutedToPool in the same transaction; carries the side.
  swapPriceReport: 'event SwapPriceReport(address indexed pair, uint256 lmpBefore, uint256 reported, uint256 lmpAfter, bool isBuy)',
  // One per launch; paymentToken is the token the launch fee was paid in.
  launchSettings: 'event LaunchSettingsRecorded(address indexed coin, uint8 volatilityPreset, uint16 volatilityBps, uint8 feePreset, uint32 makerFee, uint32 takerFee, address indexed paymentToken, uint64 liquidityLockDuration)',
}

const LAUNCH_FEES = 'Token Launch Fees';

// Raw logs carry the index as `logIndex` from an RPC and as `index` from ethers.
const logIndex = (log: any) => Number(log.logIndex ?? log.index);

const fetch = async (options: FetchOptions) => {
  const cfg = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const factory: string = await options.api.call({ target: cfg.matchingEngine, abi: ABI.orderbookFactory });
  const tokensOf = new Map<string, { base: string; quote: string }>();
  const resolveTokens = async (contracts: string[]) => {
    const missing = [...new Set(contracts.map((c) => c.toLowerCase()))].filter((c) => !tokensOf.has(c));
    if (!missing.length) return;
    const res = await options.api.multiCall({ abi: ABI.getBaseQuote, calls: missing });
    missing.forEach((c, i) => tokensOf.set(c, { base: res[i].base, quote: res[i].quote }));
  };

  // Band pools are the only fee payers whose fees are shared with LPs; everything else
  // goes to feeTo. The share is read once, only where pools exist.
  let poolFeeShare = 0;
  const pools = new Set<string>();
  if (cfg.bandPoolFactory) {
    poolFeeShare = Number(await options.api.call({ target: cfg.matchingEngine, abi: ABI.poolFeeShare }));
    const list: string[] = await options.api.fetchList({ target: cfg.bandPoolFactory, lengthAbi: ABI.allPoolsLength, itemAbi: ABI.allPools });
    list.forEach((p) => pools.add(p.toLowerCase()));
  }
  const addFee = (token: string, fee: bigint | number, label: string, sharedWithLps: boolean) => {
    if (!fee) return;
    dailyFees.add(token, fee, label);
    const lpShare = sharedWithLps ? (BigInt(fee) * BigInt(poolFeeShare)) / BigInt(DENOM) : 0n;
    dailySupplySideRevenue.add(token, lpShare, METRIC.LP_FEES);
    dailyRevenue.add(token, BigInt(fee) - lpShare, label);
  };

  // 1. CLOB fills. Volume is the quote leg of each fill.
  const matches = await options.getLogs({
    targets: [cfg.matchingEngine, cfg.stopOrderEngine].filter(Boolean) as string[],
    eventAbi: EVENT.orderMatched,
  });
  await resolveTokens(matches.map((log: any) => log.pair));
  for (const log of matches) {
    const { base, quote } = tokensOf.get(log.pair.toLowerCase())!;
    const m = log.orderMatch;
    dailyVolume.add(quote, m.quoteAmount);
    const takerIsPool = pools.has(m.sender.toLowerCase());
    addFee(base, m.baseFee, METRIC.TRADING_FEES, takerIsPool);
    addFee(quote, m.quoteFee, METRIC.TRADING_FEES, takerIsPool);
  }

  // 2. Band pool swaps, via the router and via the engine's remainder fallback.
  if (cfg.swapRouter) {
    const routed = await options.getLogs({ target: cfg.swapRouter, eventAbi: EVENT.bandSwapRouted });
    const fallbacks = await options.getLogs({ target: cfg.matchingEngine, eventAbi: EVENT.remainderRouted, entireLog: true, parseLog: true });
    const reports = fallbacks.length
      ? await options.getLogs({ target: cfg.matchingEngine, eventAbi: EVENT.swapPriceReport, entireLog: true, parseLog: true })
      : [];

    const swaps: { pool: string; quoteToBase: boolean; amountIn: bigint; amountOut: bigint }[] = [];
    routed.forEach((log: any) => swaps.push({ pool: log.pool, quoteToBase: log.quoteToBase, amountIn: BigInt(log.amountIn), amountOut: BigInt(log.amountOut) }));

    if (fallbacks.length) {
      await resolveTokens(fallbacks.map((log: any) => log.args.pair));
      const pairs = [...new Set(fallbacks.map((log: any) => log.args.pair.toLowerCase()))];
      const pairPools: string[] = await options.api.multiCall({ abi: ABI.getPool, calls: pairs });
      const poolOfPair = new Map(pairs.map((pair, i) => [pair, pairPools[i]]));
      for (const log of fallbacks) {
        const pair = log.args.pair.toLowerCase();
        // The side comes from the SwapPriceReport the engine emits just before this log.
        const report = reports
          .filter((r: any) => r.transactionHash === log.transactionHash && r.args.pair.toLowerCase() === pair && logIndex(r) < logIndex(log))
          .sort((a: any, b: any) => logIndex(b) - logIndex(a))[0];
        if (!report) throw new Error(`Iter: no SwapPriceReport for RemainderRoutedToPool in ${log.transactionHash}`);
        swaps.push({ pool: poolOfPair.get(pair)!, quoteToBase: report.args.isBuy, amountIn: BigInt(log.args.spent), amountOut: BigInt(log.args.received) });
      }
    }

    if (swaps.length) {
      const swapPools = [...new Set(swaps.map((s) => s.pool.toLowerCase()))];
      await resolveTokens(swapPools);
      // The pool charges its fee on the output token at the engine's taker rate for the
      // router times the band's premium. Fills walk the bands tightest-first, so the
      // tightest band's rate (band 0) is used for every swap; wider bands only fill when
      // a single trade has exhausted every tighter one.
      const engineRates: number[] = await options.api.multiCall({
        target: cfg.matchingEngine,
        abi: ABI.feeOf,
        calls: swapPools.map((pool) => ({ params: [tokensOf.get(pool)!.base, tokensOf.get(pool)!.quote, cfg.swapRouter!, false] as any })),
      });
      const rates: string[] = await options.api.multiCall({
        abi: ABI.effectiveFeeRate,
        calls: swapPools.map((pool, i) => ({ target: pool, params: [0, engineRates[i]] })),
      });
      const rateOf = new Map(swapPools.map((pool, i) => [pool, BigInt(rates[i])]));

      for (const swap of swaps) {
        const pool = swap.pool.toLowerCase();
        const { base, quote } = tokensOf.get(pool)!;
        const rate = rateOf.get(pool)!;
        // amountOut is net: gross = net / (1 - rate), fee = gross - net.
        const fee = (swap.amountOut * rate) / (BigInt(DENOM) - rate);
        const outToken = swap.quoteToBase ? base : quote;
        dailyVolume.add(quote, swap.quoteToBase ? swap.amountIn : swap.amountOut + fee);
        addFee(outToken, fee, METRIC.SWAP_FEES, true);
      }
    }
  }

  // 3. Launchpad. The launch fee is a flat amount per launch, set per payment token.
  if (cfg.assetGenerator) {
    const launches = await options.getLogs({ target: cfg.assetGenerator, eventAbi: EVENT.launchSettings });
    if (launches.length) {
      const erc20s = [...new Set(launches.map((log: any) => log.paymentToken.toLowerCase()))].filter((t) => t !== nullAddress);
      const [nativeFee, erc20Fees] = await Promise.all([
        options.toApi.call({ target: cfg.assetGenerator, abi: ABI.launchFee }),
        options.toApi.multiCall({ target: cfg.assetGenerator, abi: ABI.paymentOptions, calls: erc20s }),
      ]);
      const feeOf = new Map(erc20s.map((t, i) => [t, erc20Fees[i].amount]));
      for (const log of launches) {
        const token = log.paymentToken.toLowerCase();
        if (token === nullAddress) {
          dailyFees.addGasToken(nativeFee, LAUNCH_FEES);
          dailyRevenue.addGasToken(nativeFee, LAUNCH_FEES);
        } else {
          addFee(token, feeOf.get(token), LAUNCH_FEES, false);
        }
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const FEE_LABELS = {
  [METRIC.TRADING_FEES]: 'Fees taken from each orderbook fill, in the token of the leg they were charged on. Only the taker leg is charged.',
  [METRIC.SWAP_FEES]: 'Fees charged by band pools on the output token of each swap, at the engine taker rate times the tightest band premium.',
  [LAUNCH_FEES]: 'Flat fee paid to the protocol for every token launched through the launchpad, in the payment token chosen by the creator.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Quote-token leg of every orderbook fill (including triggered stop orders) and of every band pool swap, whether routed by the swap router or by the engine as the unfilled remainder of a market order.',
    Fees: 'Orderbook trading fees, band pool swap fees, and launchpad token launch fees.',
    UserFees: 'Identical to Fees: traders pay the trading and swap fees and creators pay the launch fee.',
    Revenue: 'Everything sent to the protocol fee recipient: all orderbook and launch fees, plus the share of band pool swap fees not credited to LPs.',
    ProtocolRevenue: 'Identical to Revenue. The fee recipient is the protocol.',
    SupplySideRevenue: 'The share of band pool swap fees credited to the pool LPs, as set by the engine pool fee share.',
    HoldersRevenue: 'None. No fee is distributed to token holders on-chain.',
  },
  breakdownMethodology: {
    Fees: FEE_LABELS,
    UserFees: FEE_LABELS,
    Revenue: FEE_LABELS,
    ProtocolRevenue: FEE_LABELS,
    SupplySideRevenue: {
      [METRIC.LP_FEES]: 'Band pool swap fees credited to LP positions, at the engine pool fee share.',
    },
  },
};

export default adapter;
