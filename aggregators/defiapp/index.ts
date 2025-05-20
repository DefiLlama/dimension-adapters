import { SimpleAdapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

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

type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchCacheURL(url: string) {
  const key = `${url}`;
  if (!requests[key]) {
    requests[key] = httpGet(url,  {
      headers: {
        "Content-Type": "application/json",
        // DefiLlama team to configure
        "X-API-KEY": process.env.DEFIAPP_API_KEY,
        User: "defillama",
      },
    });
  }
  return requests[key]
}

const tsToISO = (ts:number) => new Date(ts*1e3).toISOString()

const fetch = (chain: string) => {
  return async ({startTimestamp, endTimestamp}): Promise<FetchResultVolume> => {
    const dayResponse = <IDefiAppResponse>(
      await fetchCacheURL(`https://api.defi.app/api/stats/volume/between?startRefTime=${tsToISO(startTimestamp)}&endRefTime=${tsToISO(endTimestamp)}`)
    );

    const dailyVolume = dayResponse.perChainUsdVolume[defiAppChainIdMap[chain]];
    return {
      dailyVolume
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {},
  isExpensiveAdapter: true,
  version: 2,
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
