import { Adapter, FetchResultFees, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import fetchURL from "../../utils/fetchURL";


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

interface IResponse {
  daily: any[];
  allTime: any;
}

export function getParaswapAdapter(type:"fees"|"volume"){
const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees|FetchResultVolume> => {
    const timestampToday = getTimestampAtStartOfDayUTC(timestamp)
    const response: IResponse = (await fetchURL(feesMMURL));
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
            dailyFees: dailyFees ? dailyFees.toString() : undefined,
            dailyRevenue: dailyRevenue ? dailyRevenue.toString() : undefined,
            totalRevenue: totalRevenue ? totalRevenue.toString() : undefined,
            totalFees: totalFees ? totalFees.toString(): undefined,
            timestamp
        }
    } else {
        return {
            dailyVolume: dailyVolume.toString(),
            totalVolume: totalVolume.toString(),
            timestamp
        }
    }
  }
}

const adapter: Adapter = {
  adapter: Object.keys(mapChainId).reduce((all, chain)=>({
    ...all,
    [chain]:{
        fetch: fetch(chain),
        start: 1647907200,
    }
  }), {} as any)
}

return adapter
}
