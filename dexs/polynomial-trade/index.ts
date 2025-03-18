import { SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";

const polynomialAPI = "https://perps-api-mainnet.polynomial.finance/trade-stats"

interface ApiResponse {
  totalTrades: number;
  last24HrTrades: number;
  totalTradeVolume: number;
  last24HrTradeVolume: number;
  openInterest: number;
}

const fetch = async (timestamp: number) => {
    
    const  {totalTrades, last24HrTrades, totalTradeVolume, last24HrTradeVolume, openInterest}: ApiResponse = (await fetchURL(polynomialAPI));
    const startDayTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    return {
      dailyVolume: last24HrTradeVolume,
      totalVolume: totalTradeVolume,
      timestamp: startDayTimestamp,
    };
  };

  const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.POLYNOMIAL]: {
        fetch,
        runAtCurrTime: true,
        start: '2024-08-22',
      },
    },
  };

  export default adapter;
