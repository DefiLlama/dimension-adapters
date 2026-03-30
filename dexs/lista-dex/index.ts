import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import axios from "axios";

interface MarketResponse {
  code: string;
  msg: string;
  data: {
    total: number;
    list: Array<{
      marketId: string;
      isSmartLending: boolean;
      chain: string;
    }>;
  };
}

interface MarketDetailResponse {
  code: string;
  msg: string;
  data: {
    smartCollateralConfig?: {
      swapPool: string;
      token0: string;
      token1: string;
    };
  };
}

interface PoolInfo {
  pool: string;
  token0: string;
  token1: string;
}

interface SwapEventArgs {
  swap0to1: boolean;
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
  revenueCut: bigint;
  pool: string;
  token0: string;
  token1: string;
}

const HTTP_TIMEOUT_MS = 10_000;

const getSwapPools = async (chain: string): Promise<PoolInfo[]> => {
  try {
    const { data: marketList } = await axios.get<MarketResponse>(
      `https://api.lista.org/api/moolah/borrow/marketList?page=1&pageSize=1000&chain=${chain}`,
      { timeout: HTTP_TIMEOUT_MS }
    );

    const smartLendingMarkets = marketList.data.list.filter(
      (market) => market.isSmartLending && market.chain === chain
    );

    const marketDetails = await Promise.all(
      smartLendingMarkets.map((market) =>
        axios.get<MarketDetailResponse>(
          `https://api.lista.org/api/moolah/market/${market.marketId}?chain=${chain}`,
          { timeout: HTTP_TIMEOUT_MS }
        )
      )
    );

    const pools: PoolInfo[] = [];
    for (const { data: marketDetail } of marketDetails) {
      if (marketDetail.data.smartCollateralConfig) {
        const { swapPool, token0, token1 } = marketDetail.data.smartCollateralConfig;
        if (swapPool && !pools.some((p) => p.pool.toLowerCase() === swapPool.toLowerCase())) {
          pools.push({ pool: swapPool, token0, token1 });
        }
      }
    }

    return pools;
  } catch (e) {
    console.error(`lista-dex: getSwapPools failed for ${chain}`, e);
    return [];
  }
};

const abi = {
  tokenExchange:
    "event TokenExchange(address indexed user, uint256 param0, uint256 amountIn, uint256 swap0to1, uint256 amountOut, uint256 fee, uint256 revenueCut)",
};

const fetch = async ({
  getLogs,
  createBalances,
  chain,
}: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const pools = await getSwapPools(chain);
  if (pools.length === 0) {
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue };
  }

  const targets = pools.map((p) => p.pool);

  const logsByTarget = await getLogs({
    targets,
    eventAbi: abi.tokenExchange,
    flatten: false,
  });

  const allSwapEvents: SwapEventArgs[] = [];
  pools.forEach((pool, idx) => {
    const logs = logsByTarget[idx] || [];
    logs.forEach((log: any) => {
      allSwapEvents.push({
        swap0to1: BigInt(log.swap0to1) === 1n,
        amountIn: BigInt(log.amountIn),
        amountOut: BigInt(log.amountOut),
        fee: BigInt(log.fee),
        revenueCut: BigInt(log.revenueCut),
        pool: pool.pool,
        token0: pool.token0,
        token1: pool.token1,
      });
    });
  });

  allSwapEvents.forEach(({ swap0to1, amountIn, token0, token1, fee, revenueCut }) => {
    const token = swap0to1 ? token0 : token1;
    if (!token) return;
    dailyVolume.add(token, amountIn);
    dailyFees.add(token, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(token, revenueCut, METRIC.SWAP_FEES);
  });

  const dailySupplySideRevenue = dailyFees.clone(1, METRIC.SWAP_FEES);
  dailySupplySideRevenue.subtract(dailyRevenue, METRIC.SWAP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Total token swap volume across all Lista DEX pools.",
  Fees: "Total swap fees paid by users.",
  UserFees: "Users pay fees per swap.",
  Revenue: "Lista DAO takes a portion of swap fees.",
  ProtocolRevenue: "Lista DAO takes a portion of swap fees.",
  SupplySideRevenue: "Amount of swap fees distributed to LPs.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fees paid by users.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Users pay fees per swap.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "Lista DAO takes a portion of swap fees.",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: "Lista DAO takes a portion of swap fees.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "Amount of swap fees distributed to LPs.",
  },
};

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-03-01",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-03-01",
    },
  },
};

export default adapter;
