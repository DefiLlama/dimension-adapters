import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Pool {
    pool: string;
    accured: string;
    paid: string;
}


const methodology = {
    ProtocolReveneue: 'Sum of all fees accrued from LP pools.'
}

const urlTotalStats = "https://api.prod.flash.trade/market-stat/revenue-all-time";
const urlDailyStats = "https://api.prod.flash.trade/market-stat/revenue-24hr";

const fetchFlashStats = async (timestamp: number): Promise<FetchResultFees> => {
    const totalStats:Pool[]  =  (await fetchURL(urlTotalStats));
    const dailyStats:Pool[]  = (await fetchURL(urlDailyStats));
    const dailyAccured = dailyStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);
    const totalAccured = totalStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);
    return {
      timestamp,
      dailyProtocolRevenue: dailyAccured.toString(),
      totalProtocolRevenue: totalAccured.toString(),
    };
  };

  const adapter: Adapter = {
    adapter: {
      [CHAIN.SOLANA]: {
        runAtCurrTime: true,
        customBackfill: undefined,
        fetch: fetchFlashStats,
        start: 0,
        meta: {
          methodology,
        },
      },
    },
  };
  
  export default adapter;