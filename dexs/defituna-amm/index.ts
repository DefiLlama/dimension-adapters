import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_AMM_URL =
  "https://api-dev.defituna.com/api/v1/integration/defillama/amm-revenues";

const getUrl = (startTime: number, endTime: number): string => {
  return `${BASE_AMM_URL}?from_timestamp=${startTime}&to_timestamp=${endTime}`;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const url = getUrl(options.startTimestamp, options.endTimestamp);
  const response = await fetchURL(url);

  return {
    dailyVolume: response.volumeUsd || 0,
  };
};

const methodology = {
  Volume: "Total trading volume of the AMM",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-06-03",
  methodology,
};

export default adapter;
