import { Adapter, FetchResultFees, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import { httpGet } from "../../utils/fetchURL";


const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";
type TChainId = {
  [l: string | Chain]: string;
}
const mapChainId: TChainId = {
  [CHAIN.ETHEREUM]: '1',
  [CHAIN.POLYGON]: '137',
  [CHAIN.BSC]: '56',
  [CHAIN.AVAX]: '43114',
  [CHAIN.FANTOM]: '250',
  [CHAIN.ARBITRUM]: '42161',
  [CHAIN.OPTIMISM]: '10',
  [CHAIN.BASE]: '8453',
  [CHAIN.POLYGON_ZKEVM]: '1101'
} 

type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

const fetchCacheURL = (url: string) => {
  const key = `${url}`;
  if (!requests[key]) {
      const headers: any = {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "max-age=0",
        "priority": "u=0, i",
        "upgrade-insecure-requests": "1",
        "referrerPolicy": "strict-origin-when-cross-origin",
    };
      requests[key] = httpGet(url, {headers});
  }
  return requests[key];
}

interface IResponse {
  daily: any[];
  allTime: any;
}

export function getParaswapAdapter(type:"fees"|"volume"){
const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees|FetchResultVolume> => {
    const timestampToday = getTimestampAtStartOfDayUTC(timestamp)
    const response: IResponse = (await fetchCacheURL(feesMMURL));
    const dailyResultFees: any[] = response.daily;
    const [totalVolume,totalPartnerRevenue, totalProtocolRevenue]: number[] = response.allTime[mapChainId[chain]];
    const [dailyVolume, partnerRevenue, protocolRevenue]: number[] = dailyResultFees.filter(([time]: any) => time === timestampToday)
      .map(([_, data]: any) => data[mapChainId[chain]]).flat()
    const otherFees = partnerRevenue + protocolRevenue;
    const otherProtocolReveune = protocolRevenue;

    const dailyFees = otherFees;
    if (dailyFees > 1_000_000) {
      return {} as FetchResultFees;
    }
    const dailyRevenue = otherProtocolReveune;
    const totalFees = totalPartnerRevenue + totalProtocolRevenue;
    const totalRevenue = totalProtocolRevenue;
    if(type === "fees"){
        return {
            dailyFees: dailyFees ? dailyFees : undefined,
            dailyRevenue: dailyRevenue ? dailyRevenue : undefined,
            totalRevenue: totalRevenue ? totalRevenue : undefined,
            totalFees: totalFees ? totalFees: undefined,
            timestamp
        }
    } else {
        return {
            dailyVolume: dailyVolume,
            totalVolume: totalVolume,
            timestamp
        }
    }
  }
}

const adapter: Adapter = {
  version : 1,
  adapter: Object.keys(mapChainId).reduce((all, chain)=>({
    ...all,
    [chain]:{
        fetch: fetch(chain),
        start: '2022-03-22',
    }
  }), {} as any)
}

return adapter
}
