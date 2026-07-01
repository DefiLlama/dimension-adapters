import { parseUnits } from "ethers";
import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const endpoint = "https://api.grambo.fun/api/stats/defi?"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const startTime = options.startTimestamp
  const endTime = options.endTimestamp
  const res = await fetchURL(`${endpoint}since=${startTime}&until=${endTime}`)

  dailyVolume.addGasToken(parseUnits(res['volumeTon'].toString(), 9))
  return {
    dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2026-06-26',
    },
  },
  pullHourly: true,
};

export default adapter;
