import { Adapter, FetchV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const statisticsEndpoint = "https://api.titan.tg/v1/statistics"

const fetch: FetchV2 = async ({ fromTimestamp, toTimestamp }) => {
  const statistics = await httpGet(statisticsEndpoint, {
    params: {
      start: fromTimestamp,
      end: toTimestamp,
    }
  })

  return {
    dailyVolume: statistics?.volumeUsd,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2024-10-30',
    },
  }
}

export default adapter;
