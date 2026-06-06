import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_options: FetchOptions) => {
  const response = (await fetchURL(
    "https://myswap-cl-charts.s3.amazonaws.com/data/total_volume.json"
  )) as { volume: number }[];
  return {
    dailyVolume: response[response.length - 1].volume.toString(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.STARKNET],
  runAtCurrTime: true,
  start: '2023-09-19',
  deadFrom: '2025-05-15',
};

export default adapter;
