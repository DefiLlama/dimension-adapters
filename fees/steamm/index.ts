import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const methodology = {
  Fees: "Total fees paid from swaps",
  ProtocolReveneue:
    "The portion of the total fees going to the STEAMM treasury",
};

const suilendPoolsURL = () => `https://api.suilend.fi/steamm/pools/all`;
const suilendPoolHistoricalURL = (
  poolId: string,
  fromTimestamp: number,
  toTimestamp: number
) =>
  `https://api.suilend.fi/steamm/historical/fees?startTimestampS=${fromTimestamp}&endTimestampS=${toTimestamp}&intervalS=${60*60*24}&poolId=${poolId}`;

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
    const dayItem = historicalItems.find(item => Number(item.start) === dayTimestamp)
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

const fetchSteammStats = async ({ fromTimestamp }: FetchOptions) => {
  const pools = await fetchPoolsStats(fromTimestamp);

  let dailyFees = 0;
  let dailyProtocolRevenue = 0;
  for (const pool of pools) {
    dailyFees += pool.feesUsdValue;
    dailyProtocolRevenue += pool.feesUsdValue * pool.protocolFeeRate;
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees - dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
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
  methodology,
};

export default adapter;
