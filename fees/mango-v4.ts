import {
  Adapter,
  FetchResultFees,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const urlDailyStats = "https://api.mngo.cloud/data/v4/stats/protocol-daily-volume-fees";

interface DailyStats {
  total_volume_24h: number;
  total_fees_24h: number;
  spot_volume_24h: number;
  perp_volume_24h: number;
  spot_fees_24h: number;
  perp_fees_24h: number;
}

const fetch = async (_: number): Promise<FetchResultFees> => {
  const dailyStats: DailyStats = await fetchURL(urlDailyStats);

  return {
    dailyFees: dailyStats.total_fees_24h.toString(),
    dailyUserFees: dailyStats.total_fees_24h.toString(),
    dailyRevenue: dailyStats.total_fees_24h.toString(),
    dailyProtocolRevenue: dailyStats.total_fees_24h.toString(),
  };
};

const methodology = {
  Fees: 'CLOB maker/taker fees are -0.02%/0.04%. Swap fees are 0.1%, with a fee of 0.2% for stop-loss swaps. Perp maker/taker fees are -0.03%/0.1%. Stop-loss orders have a fee of 0.2%. Borrows have an origination fee of 0.05%-0.2%, based on token liquidity. Liquidations have fees ranging from 5-20%.',
  UserFees: 'CLOB maker/taker fees are -0.02%/0.04%. Swap fees are 0.1%, with a fee of 0.2% for stop-loss swaps. Perp maker/taker fees are -0.03%/0.1%. Stop-loss orders have a fee of 0.2%. Borrows have an origination fee of 0.05%-0.2%, based on token liquidity. Liquidations have fees ranging from 5-20%.',
  Revenue: 'All fees collected accrue to the Mango DAO treasury.',
  ProtocolRevenue: 'All fees collected accrue to the Mango DAO treasury.'
}

const adapter: Adapter = {
  deadFrom: '2025-02-05',
  adapter: {
    [CHAIN.SOLANA]: {
      runAtCurrTime: true,
      fetch,
    },
  },
  methodology,
  allowNegativeValue: true, // maker fees were negative in the past
};

export default adapter;
