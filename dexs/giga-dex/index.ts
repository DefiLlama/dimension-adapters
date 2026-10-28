import { Balances, cache } from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";
import { getBrownFiV3Fetch } from "../brownfi-v3";

// GIGA DEX on Robinhood Chain, contracts: https://docs.gigadex.fi/security/contracts
//
// Three pool systems, tracked as two listings that share this module:
//  - giga-dex: Classic (solidly-style stable + volatile pairs, first pair created 2026-07-15)
//    and BrownFi (oracle-based AMM pairs deployed as a GIGA white-label, first pair created 2026-07-29)
//  - giga-dex-cl: CL (PancakeSwap-v3 style concentrated liquidity pools, first pool created 2026-07-15),
//    see dexs/giga-dex-cl
//
// Every pool's protocol share of swap fees is set per pool on-chain and collected by the
// GIGA fee center (0x35A31D2De2673a021534C0395e06C09154657024), which distributes it to
// veGIGA stakers:
//  - gauged pools (pools receiving GIGA emissions, listed on the Classic / CL MasterChefs)
//    are set to 100%, LPs there are paid in GIGA emissions instead of swap fees
//  - non-gauged pools send 3% to veGIGA stakers and keep 97% for the LPs (freshly created
//    pools sit at the factory default, 20% Classic / 10% CL, until the controller sets them)
// The share is read per pool on-chain so both states are counted as they are. The protocol
// treasury keeps no direct share, it earns as a veGIGA staker, so the whole protocol share
// is reported as HoldersRevenue.

// https://robinhoodchain.blockscout.com/address/0x6Fdf38f92eAd1adFc04B73aaa947ab254f6c0916
const CLASSIC_FACTORY = "0x6Fdf38f92eAd1adFc04B73aaa947ab254f6c0916";
// ClassicFactory.FEE_DENOM, shared by pair.fee() and pair.protocolFee()
const CLASSIC_FEE_DENOM = 1e6;
const classicSwapEvent = 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';

// https://robinhoodchain.blockscout.com/address/0xEce6eCd61177336ea6Fb9b17937AC439D85EE20B
const CL_FACTORY = "0xEce6eCd61177336ea6Fb9b17937AC439D85EE20B";
const clPoolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
// pancake-v3 fork: pools emit Swap with protocolFeesToken0/1, the default uniswap-v3 Swap event matches no logs
const clSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)';
// pancake-v3 slot0: feeProtocol is a uint32, token0 share in the low 16 bits, token1 share in the high 16 bits
const clSlot0Abi = 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)';
// CLPool.PROTOCOL_FEE_DENOMINATOR
const CL_PROTOCOL_FEE_DENOM = 1e4;

// https://robinhoodchain.blockscout.com/address/0x831880Bd3b331249DF63bacC6e21495e5e8f1eAA
const BROWNFI_FACTORY = "0x831880Bd3b331249DF63bacC6e21495e5e8f1eAA";
// factory.pairConfig(), holds the per-pair fee and feeSplit
// https://robinhoodchain.blockscout.com/address/0xD3F729D909a7E84669A35c3F25b37b4AC3487784
const BROWNFI_PAIR_CONFIG = "0xD3F729D909a7E84669A35c3F25b37b4AC3487784";
const BROWNFI_START = '2026-07-29';
const BROWNFI_START_TIMESTAMP = 1785283200; // 2026-07-29T00:00:00Z

// labels kept identical to the ones the uniswap helpers emit
export const LABELS = {
  TradingFees: 'Trading fees',
  ProtocolFees: 'Protocol fees',
  LPFees: 'LP fees',
  TokenholderFees: 'Tokenholder fees',
};

export type PoolSystemResult = {
  dailyVolume: Balances,
  dailyFees: Balances,
  dailyHoldersRevenue: Balances,
  dailySupplySideRevenue: Balances,
};

// Classic pairs charge a per-pair swap fee (pair.fee(), 0.3% by default) on the input token.
// Each pair's protocol share (pair.protocolFee()) is minted as LP tokens to the pair's
// feeReceiver, the GIGA fee center.
export const classicFetch = async (options: FetchOptions): Promise<PoolSystemResult> => {
  const { createBalances, getLogs, chain, api } = options;
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${CLASSIC_FACTORY.toLowerCase()}-${chain}.json`;

  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?');
  const pairObject: Record<string, string[]> = {};
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair.toLowerCase()] = [token0s[i], token1s[i]];
  });

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const result = { dailyVolume, dailyFees, dailyHoldersRevenue, dailySupplySideRevenue };

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  const pairIds = Object.keys(filteredPairs);
  api.log(`giga-dex classic: filtered to ${pairIds.length}/${pairs.length} pairs`);
  if (!pairIds.length) return result;

  const [swapFees, protocolFees] = await Promise.all([
    api.multiCall({ abi: 'uint256:fee', calls: pairIds }),
    api.multiCall({ abi: 'uint256:protocolFee', calls: pairIds }),
  ]);
  const allLogs = await getLogs({ targets: pairIds, eventAbi: classicSwapEvent, flatten: false });

  allLogs.forEach((logs: any[], i: number) => {
    if (!logs.length) return;
    const pair = pairIds[i];
    const [token0, token1] = pairObject[pair];
    const feeRate = Number(swapFees[i]) / CLASSIC_FEE_DENOM;
    const veGigaShare = Number(protocolFees[i]) / CLASSIC_FEE_DENOM;

    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In });
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out });

      // the fee is charged on the input token, priced through whichever side of the pair is the core asset
      const feeIn = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * feeRate, amount1: Number(log.amount1In) * feeRate });
      const feeOut = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * feeRate, amount1: Number(log.amount1Out) * feeRate });
      for (const { token, amount } of [feeIn, feeOut]) {
        if (!amount) continue;
        dailyHoldersRevenue.add(token, amount * veGigaShare);
        dailySupplySideRevenue.add(token, amount * (1 - veGigaShare));
      }
    });
  });

  return result;
};

// CL pools charge their fee tier on every swap, the protocol share is stored in each
// pool's slot0.feeProtocol and collected by the GIGA fee center through collectProtocol.
export const clFetch = async (options: FetchOptions): Promise<PoolSystemResult> => {
  const { createBalances, getLogs, chain, api } = options;
  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${CL_FACTORY.toLowerCase()}.json`;
  const iface = new ethers.Interface([clPoolCreatedEvent]);

  let { logs: poolLogs } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!poolLogs?.length) throw new Error('No pools found, is there TVL adapter for this already?');
  // bad rpcs return bad log with undefined format, filter them out
  poolLogs = poolLogs.map((log: any) => iface.parseLog(log)?.args).filter((log: any) => !!log);

  const pairObject: Record<string, string[]> = {};
  const feeTiers: Record<string, number> = {};
  poolLogs.forEach((log: any) => {
    const pool = log.pool.toLowerCase();
    pairObject[pool] = [log.token0, log.token1];
    feeTiers[pool] = Number(log.fee) / 1e6;
  });

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const result = { dailyVolume, dailyFees, dailyHoldersRevenue, dailySupplySideRevenue };

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  const pools = Object.keys(filteredPairs);
  api.log(`giga-dex cl: filtered to ${pools.length}/${poolLogs.length} pools`);
  if (!pools.length) return result;

  const slot0s = await api.multiCall({ abi: clSlot0Abi, calls: pools, permitFailure: true });
  const allLogs = await getLogs({ targets: pools, eventAbi: clSwapEvent, flatten: false });

  allLogs.forEach((logs: any[], i: number) => {
    if (!logs.length) return;
    const pool = pools[i];
    const [token0, token1] = pairObject[pool];
    const feeTier = feeTiers[pool];
    const feeProtocol = Number(slot0s[i]?.feeProtocol ?? 0);
    const share0 = (feeProtocol % 65536) / CL_PROTOCOL_FEE_DENOM;
    const share1 = Math.floor(feeProtocol / 65536) / CL_PROTOCOL_FEE_DENOM;
    // both sides are always set to the same share on GIGA, average them anyway
    const veGigaShare = (share0 + share1) / 2;

    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
      const { token, amount } = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * feeTier, amount1: Number(log.amount1) * feeTier });
      dailyHoldersRevenue.add(token, amount * veGigaShare);
      dailySupplySideRevenue.add(token, amount * (1 - veGigaShare));
    });
  });

  return result;
};

// BrownFi pairs: fee and protocol share (feeSplit) are read on-chain per pair by the shared
// BrownFi fetch. The protocol share is minted to the BrownFi factory's feeTo, which is the
// GIGA fee center as well, so it goes to veGIGA stakers too.
const brownfiFetch = getBrownFiV3Fetch({
  [CHAIN.ROBINHOOD]: {
    factory: BROWNFI_FACTORY,
    pairConfig: BROWNFI_PAIR_CONFIG,
    start: BROWNFI_START,
  },
});

// BrownFi pairs only exist from BROWNFI_START, skip them on earlier runs
export const brownfiFetchFrom = async (options: FetchOptions): Promise<Partial<PoolSystemResult>> => {
  if (options.startTimestamp < BROWNFI_START_TIMESTAMP) return {};
  const brownfi: Record<string, any> = await brownfiFetch(options);
  // BrownFi's "protocol" share (feeSplit) lands in the GIGA fee center like the others
  return { dailyVolume: brownfi.dailyVolume, dailyFees: brownfi.dailyFees, dailyHoldersRevenue: brownfi.dailyRevenue, dailySupplySideRevenue: brownfi.dailySupplySideRevenue };
};

// Sum the pool systems of a listing into one set of dimensions
export const buildResult = (options: FetchOptions, systems: Partial<PoolSystemResult>[]) => {
  const merge = (label: string | undefined, key: keyof PoolSystemResult) => {
    const balances: Balances = options.createBalances();
    for (const system of systems) {
      const source: any = system[key];
      if (source && typeof source !== 'number') balances.addBalances(source, label);
    }
    return balances;
  };

  const dailyVolume = merge(undefined, 'dailyVolume');
  const dailyFees = merge(METRIC.SWAP_FEES, 'dailyFees');
  const dailyHoldersRevenue = merge(LABELS.TokenholderFees, 'dailyHoldersRevenue');
  const dailySupplySideRevenue = merge(LABELS.LPFees, 'dailySupplySideRevenue');

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(1, LABELS.TradingFees),
    dailyRevenue: dailyHoldersRevenue.clone(1, LABELS.ProtocolFees),
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
};

const fetch = async (options: FetchOptions) => {
  const classic = await classicFetch(options);
  const brownfi = await brownfiFetchFrom(options);
  return buildResult(options, [classic, brownfi]);
};

const methodology = {
  Fees: "Swap fees paid by traders across GIGA DEX Classic (stable + volatile) and BrownFi oracle-based pools, per-pair fee rate read on-chain.",
  UserFees: "Traders pay the full swap fee on every trade.",
  Revenue: "Share of swap fees collected by the GIGA fee center for veGIGA stakers, read per pair on-chain (pair.protocolFee() on Classic, feeSplit on BrownFi): 100% on gauged pairs (pairs receiving GIGA emissions), 3% on non-gauged Classic pairs.",
  HoldersRevenue: "Share of swap fees distributed to veGIGA stakers (all of the protocol's share).",
  ProtocolRevenue: "The protocol treasury keeps no direct share of swap fees, it earns as a veGIGA staker.",
  SupplySideRevenue: "Share of swap fees kept by liquidity providers: 0% on gauged pairs (LPs there earn GIGA emissions instead), 97% on non-gauged Classic pairs, the non-feeSplit part on BrownFi pairs.",
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
  },
  UserFees: {
    [LABELS.TradingFees]: "Full swap fee paid by traders on every trade.",
  },
  Revenue: {
    [LABELS.ProtocolFees]: "Per-pool protocol share of swap fees, read on-chain, collected for veGIGA stakers.",
  },
  HoldersRevenue: {
    [LABELS.TokenholderFees]: "Per-pool protocol share of swap fees distributed to veGIGA stakers.",
  },
  SupplySideRevenue: {
    [LABELS.LPFees]: "Swap fees kept by liquidity providers (total fees minus the veGIGA share).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-15',
  methodology,
  breakdownMethodology,
};

export default adapter;
