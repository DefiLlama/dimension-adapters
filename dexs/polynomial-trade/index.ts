import { SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import axios from "axios";
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
    const { data: { last24HrTradeVolume } }: { data: ApiResponse } = await axios.get(polynomialAPI, {
      headers: {
        'x-api-key': 'defillama-56d0d13c534a573be5d0fdeb426f1a9d' 
      }
    });
    const startDayTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    return {
      dailyVolume: last24HrTradeVolume,
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
