import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import axios from "axios";

async function getLyraV2Fees(timestamp: number) {
  const cleanTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );
  const cleanTimestampMs = cleanTimestamp * 1000;

  const data = await axios.get(`https://api.lyra.finance/public/statistics?instrument_name=ALL&end_time=${cleanTimestampMs}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });


  return {
    timestamp,
    dailyFees: data.data.result.daily_fees.toString(),
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.LYRA]: {
      fetch: getLyraV2Fees,
      start: '2023-11-01',
    },
  },
};

export default adapter;
