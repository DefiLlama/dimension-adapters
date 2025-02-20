import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

async function getLyraV2Fees(timestamp: number, _: any, { endTimestamp }: FetchOptions) {
  const { result: { daily_fees}} = await httpGet(`https://api.lyra.finance/public/statistics?instrument_name=ALL&end_time=${endTimestamp*1e3}`);

  return {
    timestamp,
    dailyFees: daily_fees,
  };
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.LYRA]: {
      fetch: getLyraV2Fees,
      start: '2023-11-01',
    },
  },
};

export default adapter;
