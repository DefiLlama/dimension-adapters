import { ChainApi } from "@defillama/sdk";
import axios from "axios";
import BigNumber from "bignumber.js";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import fetchURL from "../utils/fetchURL";

/**
 * Napier Finance Fees Adapter
 *
 * Napier is a fixed-rate yield protocol that allows users to trade principal tokens (PT)
 * and yield tokens (YT). Fees are collected from various activities and split between
 * curators and protocol.
 *
 * Data source: On-chain events from Pool contracts
 * Methodology:
 * - Tracks YieldFeeAccrued events from Curve TwoCrypto markets
 * - Tracks HookSwap events (hookLPfeeAmount0/1) from TokiHook pools
 * - Splits fees between curator (supply side) and protocol based on splitFeePercentage
 * - Tracks protocol reward tokens sent to treasury
 */

// ABIs for fee-tracking events
const CURVE_MARKET_ABI = {
  yieldFeeAccruedEvent: "event YieldFeeAccrued(uint256 fee)",
};

type Config = {
  treasury: string;
  start: string;
};

const chainConfig: Record<string, Config> = {
  [CHAIN.ETHEREUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-28",
  },
  [CHAIN.BASE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-02-27",
  },
  [CHAIN.SONIC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-07",
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.FRAXTAL]: {
    treasury: "0x8C244F488A742365ECB5047E78c29Ac2221ac0bf",
    start: "2024-03-11",
  },
  [CHAIN.MANTLE]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.BSC]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-11",
  },
  [CHAIN.POLYGON]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.AVAX]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-12",
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0x655231493557bb07df178Bdc29a65435934937e3",
    start: "2024-03-13",
  },
};

const TOKI_HOOK_ABI = {
  hookSwapEvent: "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)",
};

// TokiHook singleton contract addresses by chain
const TOKI_HOOK_ADDRESSES: Record<number, string> = {
  42161: "0xd4234A3D471159E03501fcC2fFD61aAf43FE1888", // Arbitrum
};


interface Market {
  chainId: number;
  metadata: {
    address: string;
  };
  pool: {
    address: string;
    poolId?: string;
    poolType?: "CURVE_TWO_CRYPTO" | "TOKI_HOOK";
  } | null;
  tokens: {
    targetToken: {
      id: string;
      decimals: number;
      address: string;
    };
    assetToken: {
      id: string;
      address: string;
      decimals: number;
    };
  };
  fees: {
    splitFeePercentage: string;
  };
  metrics: {
    underlyingRewards: Array<{
      rewardToken: {
        address: string;
      };
    }>;
  };
}

async function fetchMarkets(api: ChainApi): Promise<FetchMarketsResult> {
  const url = `https://api-v2.napier.finance/v1/market?chainIds=${api.chainId!}`;
  const data: Market[] = await fetchURL(url);

  // Separate Curve and TokiHook pools
  const curveMarkets: string[] = [];
  const tokiPools: string[] = [];
  const poolToMarket = new Map<string, Market>();

  for (const market of data) {
    if (!market.pool) continue;

    const poolAddress = market.pool.address.toLowerCase();
    poolToMarket.set(poolAddress, market);

    if (market.pool.poolType === "TOKI_HOOK") {
      tokiPools.push(poolAddress);
    } else {
      // Default to Curve (CURVE_TWO_CRYPTO or undefined)
      curveMarkets.push(poolAddress);
    }
  }

  // Build maps for Curve markets
  const marketToAsset = new Map(
    data
      .filter((m) => m.pool?.poolType !== "TOKI_HOOK")
      .map((m) => [m.metadata.address, m.tokens.assetToken.address])
  );
  const splitFeePcts = data
    .filter((m) => m.pool?.poolType !== "TOKI_HOOK")
    .map((m) => new BigNumber(m.fees.splitFeePercentage));
  // Build poolId map for TokiHook
  const poolIdToMarket = new Map<string, Market>();
  for (const poolAddress of tokiPools) {
    const market = poolToMarket.get(poolAddress);
    if (market?.pool?.poolId) {
      poolIdToMarket.set(market.pool.poolId.toLowerCase(), market);
    }
  }

  // Extract reward tokens
  const rewardTokensDuplicated = data.flatMap((m) =>
    m.metrics.underlyingRewards.map((r: any) => r.rewardToken.address)
  );
  const rewardTokens = [...new Set(rewardTokensDuplicated)];

  return {
    curveMarkets,
    tokiPools,
    poolToMarket,
    poolIdToMarket,
    marketToAsset,
    splitFeePcts,
    rewardTokens,
  };
}

export type FetchMarketsResult = {
  curveMarkets: string[];
  tokiPools: string[];
  poolToMarket: Map<string, Market>;
  poolIdToMarket: Map<string, Market>;
  marketToAsset: Map<string, string>;
  splitFeePcts: BigNumber[];
  rewardTokens: string[];
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const { getLogs, createBalances } = options;

  const {
    curveMarkets,
    tokiPools,
    poolToMarket,
    poolIdToMarket,
    marketToAsset,
    splitFeePcts,
    rewardTokens,
  } = await fetchMarkets(options.api);

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = await addTokensReceived({
    options,
    target: chainConfig[options.chain].treasury,
    tokens: rewardTokens,
  });

  // Track Curve pool fees (YieldFeeAccrued events)
  if (curveMarkets.length > 0) {
    const allFeeAccruedEvents = await getLogs({
      targets: curveMarkets,
      eventAbi: CURVE_MARKET_ABI.yieldFeeAccruedEvent,
      flatten: false,
    });

    curveMarkets.forEach((marketAddress, i) => {
      const token = marketToAsset.get(marketAddress);
      const fees = allFeeAccruedEvents[i];
      if (!token || !fees) return;

      fees.forEach(([fee]: bigint[]) => {
        const feeBn = new BigNumber(fee.toString());
        const curatorFeeBn = feeBn.times(splitFeePcts[i]).dividedToIntegerBy(100);

        dailyFees.add(token, feeBn);
        dailySupplySideRevenue.add(token, curatorFeeBn.toNumber());
        dailyRevenue.add(token, feeBn.minus(curatorFeeBn));
      });
    });
  }

  // Track TokiHook pool fees (HookSwap events with hookLPfeeAmount0/1)
  if (tokiPools.length > 0 && poolIdToMarket.size > 0) {
    const tokiHookAddress = TOKI_HOOK_ADDRESSES[options.api.chainId!];

    if (tokiHookAddress) {
      // Fetch HookSwap events from TokiHook singleton
      const hookSwapEvents = await getLogs({
        target: tokiHookAddress,
        eventAbi: TOKI_HOOK_ABI.hookSwapEvent,
      });

      // Process fees from each swap
      for (const event of hookSwapEvents) {
        const eventPoolId = event.poolId.toLowerCase();
        const market = poolIdToMarket.get(eventPoolId);

        if (!market) continue; // Not tracking this market

        const assetToken = market.tokens.assetToken.address;
        const assetDecimals = market.tokens.assetToken.decimals;
        const targetDecimals = market.tokens.targetToken.decimals;

        // hookLPfeeAmount0 = fees in target token
        const feeTarget = event.hookLPfeeAmount0;

        // Convert target token fees to asset token terms
        const feeAsset = feeTarget * BigInt(10 ** assetDecimals) / BigInt(10 ** targetDecimals);

        // For TokiHook, fees go to LPs (supply side)
        // Protocol doesn't take a cut from swap fees
        dailyFees.add(assetToken, feeAsset);
        dailySupplySideRevenue.add(assetToken, feeAsset);
      }
    }
  }
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  UserFees: "Users pay fees on swaps and other activities. Curve pools: issuance, performance, redemption, and post-settlement fees. TokiHook pools: swap fees (hookLPfeeAmount0/1)",
  Fees: "Total of all fees paid by users including Curve market fees (YieldFeeAccrued) and TokiHook swap fees (hookLPfeeAmount0/1)",
  Revenue: "Protocol revenue from treasury reward tokens. Curve markets: portion of fees based on split fee percentage. TokiHook: protocol rewards from treasury only",
  ProtocolRevenue: "Protocol revenue is the portion of fees not distributed to curators (Curve markets) plus protocol reward tokens sent to treasury",
  SupplySideRevenue: "Curve markets: curators receive a percentage based on splitFeePercentage. TokiHook: all swap fees go to LPs",
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;