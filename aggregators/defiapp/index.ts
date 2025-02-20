import { SimpleAdapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const DEFIAPP_24H_VOLUME_URL = "http://api.defi.app/api/stats/volume/24h"; // requires authentication
const START_TIMESTAMP = 1739433600; // 02.13.2025

type TChainId = {
  [l: string]: string;
};
const defiAppChainIdMap: TChainId = {
  [CHAIN.ETHEREUM]: "1",
  [CHAIN.BSC]: "56",
  [CHAIN.ARBITRUM]: "42161",
  [CHAIN.BASE]: "8453",
  [CHAIN.SOLANA]: "1151111081099710",
};

interface IDefiAppResponse {
  isLast24Hours: boolean;
  startDate: string;
  endDate: string;
  totalUsdVolume: string;
  perChainUsdVolume: Record<string, string>;
}

const fetch = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayResponse = <IDefiAppResponse>(
      await httpGet(DEFIAPP_24H_VOLUME_URL, {
        headers: {
          "Content-Type": "application/json",
          // DefiLlama team to configure
          "X-API-KEY": process.env.DEFIAPP_API_KEY,
          User: "defillama",
        },
      })
    );

    const dailyVolume = dayResponse.perChainUsdVolume[defiAppChainIdMap[chain]];
    return {
      dailyVolume: dailyVolume || "0",
      timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {},
  isExpensiveAdapter: true,
};

const chainKeys = Object.keys(defiAppChainIdMap);

chainKeys.forEach((chain: string) => {
  adapter.adapter[chain] = {
    fetch: fetch(chain),
    start: START_TIMESTAMP,
    meta: {
      methodology: {
        dailyVolume:
          "Volume is calculated by summing the usd value of all token trades routed via DefiApp protocol in the last 24h.",
      },
    },
  };
});

export default adapter;
