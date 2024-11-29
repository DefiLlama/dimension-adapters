import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

export const maverickV2Factories: { [key: string]: any } = {
  [CHAIN.ETHEREUM]: {
    factory: "0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e",
    startBlock: 20027236,
    startTimestamp: 1717372801,
  },
  [CHAIN.ARBITRUM]: {
    factory: "0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e",
    startBlock: 219205177,
    startTimestamp: 1717372801,
  },
  [CHAIN.ERA]: {
    factory: "0x7A6902af768a06bdfAb4F076552036bf68D1dc56",
    startBlock: 35938167,
    startTimestamp: 1717372801,
  },
  [CHAIN.BSC]: {
    factory: "0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e",
    startBlock: 39421941,
    startTimestamp: 1717372801,
  },
  [CHAIN.BASE]: {
    factory: "0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e",
    startBlock: 15321281,
    startTimestamp: 1717372801,
  },
  [CHAIN.SCROLL]: {
    factory: "0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e",
    startBlock: 7332349,
    startTimestamp: 1720621814,
  },
};

const mavV2PoolCreated = `event PoolCreated(address poolAddress,uint8 protocolFeeRatio,uint256 feeAIn,uint256 feeBIn,uint256 tickSpacing,uint256 lookback,int32 activeTick,address tokenA,address tokenB,uint8 kinds,address accessor)`;

const mavV2SwapEvent =
  "event PoolSwap(address sender,address recipient,(uint256 amount,bool tokenAIn,bool exactOutput,int32 tickLimit) params,uint256 amountIn,uint256 amountOut)";

export const getData = async (options: FetchOptions) => {
  const factory = maverickV2Factories[options.chain].factory;
  const factoryFromBlock = maverickV2Factories[options.chain].startBlock;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  try {
    const logs = await options.getLogs({
      target: factory,
      fromBlock: factoryFromBlock,
      eventAbi: mavV2PoolCreated,
    });
    const pools = [...new Set(logs.map((log: any) => log.poolAddress))];
    const tokenAs = await options.api.multiCall({ abi: "address:tokenA", calls: pools! });
    const tokenBs = await options.api.multiCall({ abi: "address:tokenB", calls: pools! });
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
        dailyFees.add(tokenAIn ? tokenA : tokenB, (amount) * (fee / 1e18));
        dailyVolume.add(tokenAIn ? tokenA : tokenB, amount);
      });
    });
    return {
      dailyVolume: dailyVolume,
      dailyFees: dailyFees,
    };
  } catch (e) {
    console.error(e);
    return {
      dailyVolume: dailyVolume,
      dailyFees: dailyFees,
    };
  }
};
