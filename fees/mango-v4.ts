import {
  Adapter,
  FetchResultFees,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const urlTotalStats =
  "https://api.mngo.cloud/data/v4/stats/protocol-total-volume-fees";
const urlDailyStats =
  "https://api.mngo.cloud/data/v4/stats/protocol-daily-volume-fees";

interface TotalStats {
  total_volume: number;
  total_fees: number;
  spot_volume: number;
  perp_volume: number;
  spot_fees: number;
  perp_fees: number;
}
interface DailyStats {
  total_volume_24h: number;
  total_fees_24h: number;
  spot_volume_24h: number;
  perp_volume_24h: number;
  spot_fees_24h: number;
  perp_fees_24h: number;
}

const methodology = {
  Fees: 'CLOB maker/taker fees are -0.02%/0.04%. Swap fees are 0.1%, with a fee of 0.2% for stop-loss swaps. Perp maker/taker fees are -0.03%/0.1%. Stop-loss orders have a fee of 0.2%. Borrows have an origination fee of 0.05%-0.2%, based on token liquidity. Liquidations have fees ranging from 5-20%.',
  ProtocolReveneue: 'All fees collected accrue to the Mango DAO treasury.'
}

const fetchMangoStats = async (timestamp: number): Promise<FetchResultFees> => {
  const totalStats: TotalStats = (await fetchURL(urlTotalStats));
  const dailyStats: DailyStats = (await fetchURL(urlDailyStats));
  return {
    timestamp,
    dailyFees: dailyStats.total_fees_24h.toString(),
    totalFees: totalStats.total_fees.toString(),
    dailyProtocolRevenue: dailyStats.total_fees_24h.toString(),
    totalProtocolRevenue: totalStats.total_fees.toString(),
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      runAtCurrTime: true,
      customBackfill: undefined,
      fetch: fetchMangoStats,
      start: 0,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
