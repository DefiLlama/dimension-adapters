import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { SUILEND_API_ENDPOINT, SuiLendMetrics } from "../suilend";

const suilendPoolsURL = () => SUILEND_API_ENDPOINT + '/steamm/pools/all';
const suilendPoolHistoricalURL = (
  poolId: string,
  fromTimestamp: number,
  toTimestamp: number
) =>
  `${SUILEND_API_ENDPOINT}/steamm/historical/fees?startTimestampS=${fromTimestamp}&endTimestampS=${toTimestamp}&intervalS=${60*60*24}&poolId=${poolId}`;

interface PoolInfo {
  id: string;
  feesUsdValue: number;
  protocolFeeRate: number;
}

async function fetchPoolsStats(dayTimestamp: number): Promise<Array<PoolInfo>> {
  const poolInfos: Array<PoolInfo> = [];

  const poolConfigs = await fetchURL(suilendPoolsURL());
  for (const poolConfig of poolConfigs) {
    const historicalItems = await fetchURL(
      suilendPoolHistoricalURL(
        poolConfig.pool.id,
        dayTimestamp,
        dayTimestamp + 24 * 60 * 60 - 1
      )
    );
    const dayItem = historicalItems.find((item: any) => Number(item.start) === dayTimestamp)
    if (dayItem) {
      poolInfos.push({
        id: poolConfig.pool.id,
        feesUsdValue: Number(dayItem.usdValue),
        protocolFeeRate:
          Number(poolConfig.pool.protocolFees.config.feeNumerator) /
          Number(poolConfig.pool.protocolFees.config.feeDenominator),
      });
    }
  }

  return poolInfos;
}

const fetchSteammStats = async ({ fromTimestamp, createBalances }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  
  const pools = await fetchPoolsStats(fromTimestamp);

  for (const pool of pools) {
    const protocolRevenue = Number(pool.feesUsdValue) * Number(pool.protocolFeeRate);
    const supplySideRevenue = Number(pool.feesUsdValue) - protocolRevenue;
    
    dailyFees.addUSDValue(Number(pool.feesUsdValue), SuiLendMetrics.SteammSwapFees);
    dailySupplySideRevenue.addUSDValue(supplySideRevenue, SuiLendMetrics.SteammSwapFeesToLPs);
    dailyRevenue.addUSDValue(protocolRevenue, SuiLendMetrics.SteammSwapFeesToProtocol);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSteammStats,
      start: "2025-02-16",
    },
  },
  methodology: {
    Fees: "Total fees paid from swaps",
    Revenue: "The portion of the total fees going to the STEAMM treasury",
    ProtocolRevenue: "The portion of the total fees going to the STEAMM treasury",
    SupplySideRevenue: "The portion of the total fees going to LPs",
  },
  breakdownMethodology: {
    Fees: {
      [SuiLendMetrics.SteammSwapFees]: 'Total swap fees paid by users',
    },
    Revenue: {
      [SuiLendMetrics.SteammSwapFeesToProtocol]: 'The portion of the total fees going to the STEAMM treasury',
    },
    SupplySideRevenue: {
      [SuiLendMetrics.SteammSwapFeesToLPs]: 'The portion of the total fees going to LPs',
    },
  }
};

export default adapter;
