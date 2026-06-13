import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { joeLiquidityBookExport } from "../../helpers/joe";
import { METRIC } from "../../helpers/metrics";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// Holders Revenue is only applicable once the $ONE token is launched (Not launched currently)
type FactoryVersion = 2 | 2.2;
type ChainConfig = { start: string; uniV2Factory: string; factories: { factory: string; version: FactoryVersion; fromBlock: number }[] };
type BalanceResult = FetchResultV2 & { dailyVolume: Balances; dailyFees: Balances; dailyRevenue: Balances };

// Contract source: https://docs.sectorone.xyz/info/smart-contracts
// fromBlock values are factory deployment blocks verified on block explorers.
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.MEGAETH]: {
    start: "2025-12-29",
    uniV2Factory: "0x3B35A0438B36E045d848c84949734E0F9e130355",
    factories: [
      { factory: "0xc715C99789F2A37750ac917Fca782C9e903D1434", version: 2, fromBlock: 9050584 },
      { factory: "0x304BaEB300dD71CD76f771343E74612C2237a320", version: 2.2, fromBlock: 4240508 },
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: "2026-03-05",
    uniV2Factory: "0x96559Af835E5A3E9Bb68c17eBA8520295370698f",
    factories: [
      { factory: "0x98501D0bb98d92a3234bae0F2a42beFb5075224A", version: 2, fromBlock: 24626369 },
      { factory: "0x9d8688043150c2B2A4cdCE2eD03eB40b6cCd2c57", version: 2.2, fromBlock: 24626369 },
    ],
  },
  [CHAIN.BASE]: {
    start: "2025-07-25",
    uniV2Factory: "0xcF0685f37A139DE56AFC4A89aa343849358c05Cb",
    factories: [
      { factory: "0x217da3e53F221D1f36e8b09bc7d55d4012C0aa70", version: 2, fromBlock: 42532043 },
      { factory: "0x3357f02fB3aA78fc86D3Bccdc5Edf039D4b952B5", version: 2.2, fromBlock: 33296377 },
    ],
  },
}

const uniV2Fetch: (options: FetchOptions) => Promise<BalanceResult> = async (options) => {
  const config = chainConfig[options.chain];
  const allPairsLength = await options.api.call({
    target: config.uniV2Factory,
    abi: "uint256:allPairsLength",
  });
  if (Number(allPairsLength) === 0) return {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
  };

  const uniV2AdapterFetch: (options: FetchOptions) => Promise<BalanceResult> = getUniV2LogAdapter({
    factory: config.uniV2Factory,
    fees: 0.003,
    revenueRatio: 0.2,
    allowReadPairs: true,
  });

  return uniV2AdapterFetch(options);
}

const joeFetch: (options: FetchOptions) => Promise<BalanceResult> = async (options) => {
  const joeAdapterFetch = (joeLiquidityBookExport(chainConfig).adapter as Record<string, { fetch: (options: FetchOptions) => Promise<BalanceResult> }>)[options.chain].fetch;
  const getLogs = async (...args: any[]) => {
    const logs = await (options.getLogs as any)(...args);

    return logs.map((log: any) => {
      if (log.args?.amountIn === undefined) return log;

      return {
        ...log,
        args: {
          ...log.args,
          amountIn: Number(log.args.amountIn),
          amountOut: Number(log.args.amountOut),
          fees: Number(log.args.fees),
        },
      }
    });
  }

  return joeAdapterFetch({ ...options, getLogs } as FetchOptions);
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const uniV2Result = await uniV2Fetch(options);
  const lbResult = await joeFetch(options);

  dailyVolume.addBalances(uniV2Result.dailyVolume);
  dailyVolume.addBalances(lbResult.dailyVolume);
  dailyFees.addBalances(uniV2Result.dailyFees, METRIC.SWAP_FEES);
  dailyFees.addBalances(lbResult.dailyFees, METRIC.SWAP_FEES);
  dailyRevenue.addBalances(uniV2Result.dailyRevenue, METRIC.PROTOCOL_FEES);
  dailyRevenue.addBalances(lbResult.dailyRevenue, METRIC.PROTOCOL_FEES);

  dailySupplySideRevenue.addBalances(dailyFees, METRIC.LP_FEES);
  dailySupplySideRevenue.subtract(dailyRevenue, METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Swap fees paid by users in SectorOne Uniswap v2 and Liquidity Book pools.",
  UserFees: "Swap fees paid by users in SectorOne Uniswap v2 and Liquidity Book pools.",
  Revenue: "Protocol operations share of swap fees.",
  ProtocolRevenue: "Protocol operations share of swap fees.",
  SupplySideRevenue: "Swap fees paid to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users in SectorOne Uniswap v2 and Liquidity Book pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users in SectorOne Uniswap v2 and Liquidity Book pools.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol operations share of swap fees.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol operations share of swap fees.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Swap fees paid to liquidity providers.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;
