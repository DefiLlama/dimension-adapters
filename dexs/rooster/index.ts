//  Maverick v2 volume
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

export const factories: { [key: string]: any } = {
  [CHAIN.PLUME]: {
    factory: "0x056A588AfdC0cdaa4Cab50d8a4D2940C5D04172E",
    startBlock: 12119,
    start: '2025-03-13',
  },
  [CHAIN.PLUME_LEGACY]: {
    factory: "0x056A588AfdC0cdaa4Cab50d8a4D2940C5D04172E",
    startBlock: 91952,
    start: '2024-12-20',
  },
};

const mavV2PoolCreated = `event PoolCreated(address poolAddress,uint8 protocolFeeRatio,uint256 feeAIn,uint256 feeBIn,uint256 tickSpacing,uint256 lookback,int32 activeTick,address tokenA,address tokenB,uint8 kinds,address accessor)`;
const mavV2SwapEvent = "event PoolSwap(address sender,address recipient,(uint256 amount,bool tokenAIn,bool exactOutput,int32 tickLimit) params,uint256 amountIn,uint256 amountOut)";

const fetch = async (options: FetchOptions) => {
  const factory = factories[options.chain].factory;
  const factoryFromBlock = factories[options.chain].startBlock;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: factory,
    fromBlock: factoryFromBlock,
    eventAbi: mavV2PoolCreated,
    cacheInCloud: true,
  });

  const pools = [...new Set(logs.map((log: any) => log.poolAddress))];
  const tokenAs = await options.api.multiCall({
    abi: "address:tokenA",
    calls: pools!,
    permitFailure: true,
  });
  const tokenBs = await options.api.multiCall({
    abi: "address:tokenB",
    calls: pools!,
    permitFailure: true,
  });

  const swapLogs = await options.getLogs({
    targets: pools,
    eventAbi: mavV2SwapEvent,
    topic: "0x103ed084e94a44c8f5f6ba8e3011507c41063177e29949083c439777d8d63f60",
    flatten: false,
  });

  const feesA = logs.map((log: any) => Number(log.feeAIn));
  const feesB = logs.map((log: any) => Number(log.feeBIn));

  swapLogs.forEach((log: any[], index: number) => {
    const tokenA = tokenAs[index];
    const tokenB = tokenBs[index];
    if (!log.length) return;
    log.forEach((i: any) => {
      // element 3 is amount in
      const amount = Number(i[3]);
      // element 2,1 is tokenAIn
      const tokenAIn = Boolean(i[2][1]);
      const fee = tokenAIn ? feesA[index] : feesB[index];
      dailyFees.add(tokenAIn ? tokenA : tokenB, amount * (fee / 1e18));
      dailyVolume.add(tokenAIn ? tokenA : tokenB, amount);
    });
  });

  return {
    dailyVolume,
    dailyFees
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.PLUME]: {
      fetch,
      start: factories[CHAIN.PLUME].start,
    },
    [CHAIN.PLUME_LEGACY]: {
      fetch: async () => ({}),
      start: factories[CHAIN.PLUME_LEGACY].start,
      deadFrom: "2025-06-25",
    },
  },
};

export default adapter;
