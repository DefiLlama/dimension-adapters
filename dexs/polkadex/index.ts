import fetchURL from "../../utils/fetchURL"
import {FetchOptions, FetchV2, SimpleAdapter} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IAPIResponse = {
  volume_usd: number;
};

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const response: IAPIResponse = (await fetchURL(`https://integration-api.polkadex.trade/v1/volumeByRange?start=${options.startTimestamp}&end=${options.endTimestamp}`));
  const dailyVolume = response.volume_usd;

  return {
    dailyVolume: dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLKADEX]: {
      fetch: fetchVolume,
      start: '2024-01-03'
    }
  },
  // integration-api.polkadex.trade and the polkadex.trade apex both SERVFAIL. Last published
  // point 2025-01-14 ($1).
  deadFrom: '2025-01-15',
};

export default adapter;