import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";

async function getLyraV2Fees({endTimestamp}) {
  const data = await axios.get(`https://api.lyra.finance/public/statistics?instrument_name=ALL&end_time=${endTimestamp*1e3}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return {
    dailyFees: data.data.result.daily_fees.toString(),
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LYRA]: {
      fetch: getLyraV2Fees,
      start: '2023-11-01',
    },
  },
};

export default adapter;
