import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CASHMERE_BRIDGE_API_URL = "https://kapi.cashmere.exchange/defillama/bridge/volumes";

const getUrl = (startTime: number, endTime: number): string => {
  return `${CASHMERE_BRIDGE_API_URL}?from_timestamp=${startTime}&to_timestamp=${endTime}`;
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const url = getUrl(options.startTimestamp, options.endTimestamp);
  const response = await fetchURL(url);

  return {
    dailyBridgeVolume: response.volumeUsd || response.dailyBridgeVolume || 0,
  };
};

const methodology = {
  Volume: "Total volume of Cashmere cross-chain transfers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM], // Aggregate data across all chains, represented under Ethereum
  start: "2025-09-08",
  methodology,
};

export default adapter;
