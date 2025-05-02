import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type VolumeResponse = { timestamp: number; volume: number };
const fetch = async (timestamp: number) => {
  const response = (await fetchURL(
    "https://myswap-cl-charts.s3.amazonaws.com/data/total_volume.json"
  )) as VolumeResponse[];
  return {
    timestamp: timestamp,
    dailyVolume: response[response.length - 1].volume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-09-19',
    },
  },
};

export default adapter;
