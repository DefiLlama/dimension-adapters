import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { filterPools2 } from "../../helpers/uniswap";

export const maverickV1Factories: { [key: string]: any } = {
  [CHAIN.ETHEREUM]: {
    factory: "0xEb6625D65a0553c9dBc64449e56abFe519bd9c9B",
    startBlock: 17210220,
    startTimestamp: 1683417601,
  },
  [CHAIN.ERA]: {
    factory: "0x2C1a605f843A2E18b7d7772f0Ce23c236acCF7f5",
    startBlock: 3002730,
    startTimestamp: 1683417601,
  },
  [CHAIN.BSC]: {
    factory: "0x76311728FF86054Ad4Ac52D2E9Ca005BC702f589",
    startBlock: 29241049,
    startTimestamp: 1687132801,
  },
  [CHAIN.BASE]: {
    factory: "0xB2855783a346735e4AAe0c1eb894DEf861Fa9b45",
    startBlock: 1489614,
    startTimestamp: 1689724801,
  },
};

const mavV2PoolCreated =
  "event PoolCreated(address poolAddress,uint256 fee,uint256 tickSpacing,int32 activeTick,int256 lookback,uint64 protocolFeeRatio,address tokenA,address tokenB)";

const mavV2SwapEvent =
  "event Swap(address sender,address recipient,bool tokenAIn,bool exactOutput,uint256 amountIn,uint256 amountOut,int32 activeTick)";

const getData = async (options: any, dataType: "volume" | "fee") => {
  const factory = maverickV1Factories[options.chain].factory;
  const factoryFromBlock = maverickV1Factories[options.chain].startBlock;

  let pools: string[];
  const logs = await options.getLogs({ target: factory, fromBlock: factoryFromBlock, eventAbi: mavV2PoolCreated, cacheInCloud: true, });

  pools = logs.map((log: any) => log.poolAddress.toLowerCase());
  const tokenAs = await options.api.multiCall({ abi: "address:tokenA", calls: pools!, });
  const tokenBs = await options.api.multiCall({ abi: "address:tokenB", calls: pools!, });
  let fees = await options.api.multiCall({ abi: "function fee() view returns (uint256)", calls: pools!, });
  const poolInfos = {  } as any
  pools.forEach((pool, idx) => {
    poolInfos[pool] = {
      tokenA: tokenAs[idx],
      tokenB: tokenBs[idx],
      fee: fees[idx] / 1e18,
    }
  })

  const filteredPoolsRes = await filterPools2({ fetchOptions: options, pairs: pools, token0s: tokenAs, token1s: tokenBs })
  pools = filteredPoolsRes.pairs

  const swapLogs = await options.getLogs({ targets: pools, eventAbi: mavV2SwapEvent, flatten: false, });
  
  swapLogs.forEach((log: any[], index: number) => {
    const { tokenA, tokenB, fee } = poolInfos[pools[index]]
    if (!log.length) return;
    log.forEach((i: any) => {
      let amount = Number(i.amountIn);
      let tokenAIn = Boolean(i.tokenAIn);

      if (dataType == "fee") {
        options.api.add(tokenAIn ? tokenA : tokenB, amount * fee);
      } else {
        options.api.add(tokenAIn ? tokenA : tokenB, amount);
      }
    });
  });

  let amount = await options.api.getBalancesV2();
  if (dataType == "fee") {
    return {
      dailyFees: amount,
      dailyUserFees: amount,
    };
  } else {
    return {
      dailyVolume: amount,
    };
  }
};

export const fetchVolumeV1 = () => {
  return async (options: FetchOptions) => {
    return await getData(options, "volume");
  };
};

export const fetchFeeV1 = () => {
  return async (options: FetchOptions) => {
    return await getData(options, "fee");
  };
};
