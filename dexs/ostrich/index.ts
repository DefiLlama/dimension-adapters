import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const URLEndpoint = "https://mainnetapiserver.ostrich.exchange/api/v1/stats/defillama-ostrich?endTime=";
const startTimestamp = 1748827388; // 01.06.2025

interface IAPIResponse {
  last24HourVolume: string;
  totalVolume: string;
}
const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { last24HourVolume, }: IAPIResponse = (
    await fetchURL(`${URLEndpoint}${options.toTimestamp}`)
  );
  return {
    dailyVolume: last24HourVolume,};
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: startTimestamp,
};

export default adapter;