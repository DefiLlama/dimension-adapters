import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface PoolInfo {
  pool: string;
  token0: string;
  token1: string;
  fee: number;
}

interface SwapEventArgs {
  swap0to1: boolean;
  amountIn: bigint;
  amountOut: bigint;
  to: string;
  pool: string;
  token0: string;
  token1: string;
  fee: bigint;
}

const dexReservesResolver = (chain: string) => {
  switch (chain) {
    case CHAIN.ETHEREUM: 
      return "0xE8a07a32489BD9d5a00f01A55749Cf5cB854Fd13";
    case CHAIN.ARBITRUM: 
      return "0xb8f526718FF58758E256D9aD86bC194a9ff5986D";
    case CHAIN.POLYGON: 
      return "0xA508fd16Bf3391Fb555cce478C616BDe4a613052";
    case CHAIN.BASE: 
      return "0x160ffC75904515f38C9b7Ed488e1F5A43CE71eBA";
    default: 
      throw new Error("DexReservesResolver not defined");
  }
}


const abi = {
  getAllPools: "function getAllPools() view returns (tuple(address pool, address token0, address token1, uint256 fee)[])",
  swap: "event Swap(bool swap0to1, uint256 amountIn, uint256 amountOut, address to)",
};

const fetch = async ({ api, createBalances, getLogs }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances()
  const rawPools: PoolInfo[] = await api.call({ target: dexReservesResolver(api.chain), abi: abi.getAllPools });
  const pools = rawPools.map(({ pool, token0, token1, fee }) => ({ pool, token0, token1, fee: BigInt(fee) }));

  const logsByPool: SwapEventArgs[][]= await Promise.all(
    pools.map(async pool => {
      const logs: SwapEventArgs[] = await getLogs({
        targets: [pool.pool],
        onlyArgs: true,
        eventAbi: abi.swap,
      });
      
      return logs.map(log => ({
        swap0to1: log[0] as boolean,
        amountIn: log[1] as bigint,
        amountOut: log[2] as bigint,
        to: log[3] as string,
        ...pool
      }));
    })
  );

  const allSwapEvents = logsByPool.flat();
  const swapEvents0to1 = allSwapEvents.filter(event => event.swap0to1);
  const swapEvents1to0 = allSwapEvents.filter(event => !event.swap0to1);

  const processSwapEvents = (events: SwapEventArgs[], isSwap0to1: boolean) => {
    events.forEach(({ amountIn, token0, token1, fee }) => {
      const feesCollected = (amountIn * fee) / 1000000n // 1000000n = 100%
      if (isSwap0to1) {
        dailyVolume.add(token0, amountIn);
        dailyFees.add(token0, feesCollected);
      } else {
        dailyVolume.add(token1, amountIn);
        dailyFees.add(token1, feesCollected);
      }
    });
  };

  processSwapEvents(swapEvents0to1, true);
  processSwapEvents(swapEvents1to0, false);

  return { dailyVolume, dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-10-26' },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-12-23' },
    [CHAIN.POLYGON]: { fetch, start: '2025-04-03' },
    [CHAIN.BASE]: { fetch, start: '2025-05-22' },
  },
};

export default adapter;

// test: yarn test dexs fluid-dex