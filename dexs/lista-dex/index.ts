import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

interface MarketResponse {
  code: string;
  msg: string;
  data: {
    total: number;
    list: Array<{
      marketId: string;
      isSmartLending: boolean;
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

const getSwapPools = async (): Promise<PoolInfo[]> => {
  const { data: marketList } = await axios.get<MarketResponse>(
    "https://api.lista.org/api/moolah/borrow/marketList?page=1&pageSize=1000&chain=bsc"
  );

  const smartLendingMarkets = marketList.data.list.filter(
    (market) => market.isSmartLending
  );

  const pools: PoolInfo[] = [];

  for (const market of smartLendingMarkets) {
    const { data: marketDetail } = await axios.get<MarketDetailResponse>(
      `https://api.lista.org/api/moolah/market/${market.marketId}?chain=bsc`
    );

    if (marketDetail.data.smartCollateralConfig) {
      const { swapPool, token0, token1 } = marketDetail.data.smartCollateralConfig;
      if (swapPool && !pools.some((p) => p.pool.toLowerCase() === swapPool.toLowerCase())) {
        pools.push({
          pool: swapPool,
          token0,
          token1,
        });
      }
    }
  }

  return pools;
};

const abi = {
  tokenExchange:
    "event TokenExchange(address indexed user, uint256 param0, uint256 amountIn, uint256 swap0to1, uint256 amountOut, uint256 fee, uint256 revenueCut)",
};

const fetch = async ({
  getLogs,
  createBalances,
}: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const pools = await getSwapPools();

  const logsByPool: SwapEventArgs[][] = await Promise.all(
    pools.map(async (pool) => {
      const logs = await getLogs({
        target: pool.pool,
        eventAbi: abi.tokenExchange,
      });

      return logs.map((log: any) => ({
        swap0to1: BigInt(log.swap0to1) === 1n,
        amountIn: BigInt(log.amountIn),
        amountOut: BigInt(log.amountOut),
        fee: BigInt(log.fee),
        revenueCut: BigInt(log.revenueCut),
        pool: pool.pool,
        token0: pool.token0,
        token1: pool.token1,
      }));
    })
  );

  const allSwapEvents = logsByPool.flat();
  const swapEvents0to1 = allSwapEvents.filter((event) => event.swap0to1);
  const swapEvents1to0 = allSwapEvents.filter((event) => !event.swap0to1);

  const processSwapEvents = (events: SwapEventArgs[], isSwap0to1: boolean) => {
    events.forEach(({ amountIn, token0, token1, fee, revenueCut }) => {
      if (isSwap0to1) {
        dailyVolume.add(token0, amountIn);
        dailyFees.add(token0, fee);
        dailyRevenue.add(token0, revenueCut);
      } else {
        dailyVolume.add(token1, amountIn);
        dailyFees.add(token1, fee);
        dailyRevenue.add(token1, revenueCut);
      }
    });
  };

  processSwapEvents(swapEvents0to1, true);
  processSwapEvents(swapEvents1to0, false);

  const dailySupplySideRevenue = dailyFees.clone();
  dailySupplySideRevenue.subtract(dailyRevenue);

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

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-03-01",
    },
  },
};

export default adapter;
