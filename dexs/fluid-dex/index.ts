import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

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
  revenueCut: bigint;
}

const FLUID_DEX_METRICS = {
  SwapFees: METRIC.SWAP_FEES,
  SwapFeesToSuppliers: 'Swap Fees To LPs',
  SwapFeesToTreasury: 'Swap Fees To Treasury',
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
    case CHAIN.PLASMA: 
      return "0x2e28FBdE85512086bF2f61477274646c06b2032b";
    default: 
      throw new Error("DexReservesResolver not defined");
  }
}

const dexResolver = (chain: string) => {
  switch (chain) {
    case CHAIN.ETHEREUM: 
      return "0x7af0C11F5c787632e567e6418D74e5832d8FFd4c";
    case CHAIN.ARBITRUM: 
      return "0x1De42938De444d376eBc298E15D21F409b946E6D";
    case CHAIN.POLYGON: 
      return "0xa17798d03bB563c618b9C44cAd937340Bad99138";
    case CHAIN.BASE: 
      return "0x93f587618A5380f40329E652f8D26CB16dAE3a47";
    case CHAIN.PLASMA: 
      return "0x851ab045dFD8f3297a11401110d31Fa9191b0E04";
    default: 
      throw new Error("DexResolver not defined");
  }
}

const abi = {
  getAllPools: "function getAllPools() view returns (tuple(address pool, address token0, address token1, uint256 fee)[])",
  getDexConfigs: "function getDexConfigs(address dexPool) view returns (tuple(bool isSmartCollateralEnabled, bool isSmartDebtEnabled, uint256 fee, uint256 revenueCut, uint256 upperRange, uint256 lowerRange, uint256 upperShiftThreshold, uint256 lowerShiftThreshold, uint256 shiftingTime, address centerPriceAddress, address hookAddress, uint256 maxCenterPrice, uint256 minCenterPrice, uint256 utilizationLimitToken0, uint256 utilizationLimitToken1, uint256 maxSupplyShares, uint256 maxBorrowShares))",
  swap: "event Swap(bool swap0to1, uint256 amountIn, uint256 amountOut, address to)",
};

const fetch = async ({ api, createBalances, getLogs }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()

  const rawPools: PoolInfo[] = await api.call({ target: dexReservesResolver(api.chain), abi: abi.getAllPools });
  const rawPoolConfigs = await api.multiCall({ 
    abi: abi.getDexConfigs, 
    calls: rawPools.map((pool) => {
      return {
        target: dexResolver(api.chain),
        params: [pool.pool],
      }
    })
  });
  const pools = rawPools.map(({ pool, token0, token1, fee }, index: number) => ({ pool, token0, token1, fee: BigInt(fee), revenueCut: BigInt(rawPoolConfigs[index].revenueCut) }));

  const logsByPool: SwapEventArgs[][]= await Promise.all(
    pools.map(async pool => {
      const logs: SwapEventArgs[] = await getLogs({
        targets: [pool.pool],
        onlyArgs: true,
        eventAbi: abi.swap,
      });
      
      return logs.map((log: any) => ({
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
    events.forEach(({ amountIn, token0, token1, fee, revenueCut }) => {
      const feesCollected = (amountIn * fee) / 1000000n // 1000000n = 100%
      const revenueCollected = feesCollected * revenueCut / 100n
      if (isSwap0to1) {
        dailyVolume.add(token0, amountIn);
        dailyFees.add(token0, feesCollected, FLUID_DEX_METRICS.SwapFees);
        dailyRevenue.add(token0, revenueCollected, FLUID_DEX_METRICS.SwapFeesToTreasury);
      } else {
        dailyVolume.add(token1, amountIn);
        dailyFees.add(token1, feesCollected, FLUID_DEX_METRICS.SwapFees);
        dailyRevenue.add(token1, revenueCollected, FLUID_DEX_METRICS.SwapFeesToTreasury);
      }
    });
  };

  processSwapEvents(swapEvents0to1, true);
  processSwapEvents(swapEvents1to0, false);

  const dailySupplySideRevenue = dailyFees.clone(1, FLUID_DEX_METRICS.SwapFeesToSuppliers)
  dailySupplySideRevenue.subtract(dailyRevenue, FLUID_DEX_METRICS.SwapFeesToSuppliers)

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
  Volume: 'Total token swap volume across all Fluid Dex pools.',
  Fees: 'Total swap fees paid by users.',
  UserFees: 'Users pay fees per swap.',
  Revenue: 'Fluid takes a portion of swap fees.',
  ProtocolRevenue: 'Fluid takes a portion of swap fees.',
  SupplySideRevenue: 'Amount of swap fees distributed to LPs.',
}

const breakdownMethodology = {
  Fees: {
    [FLUID_DEX_METRICS.SwapFees]: 'Total swap fees paid by users.',
  },
  Revenue: {
    [FLUID_DEX_METRICS.SwapFeesToTreasury]: 'Fluid takes a portion of swap fees.',
  },
  ProtocolRevenue: {
    [FLUID_DEX_METRICS.SwapFeesToTreasury]: 'Fluid takes a portion of swap fees.',
  },
  SupplySideRevenue: {
    [FLUID_DEX_METRICS.SwapFeesToSuppliers]: 'Amount of swap fees distributed to LPs.',
  },
}

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-10-26' },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-12-23' },
    [CHAIN.POLYGON]: { fetch, start: '2025-04-03' },
    [CHAIN.BASE]: { fetch, start: '2025-05-22' },
    [CHAIN.PLASMA]: { fetch, start: '2025-09-22' },
  },
};

export default adapter;

// test: yarn test dexs fluid-dex