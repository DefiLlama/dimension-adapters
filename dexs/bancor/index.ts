import { FetchResult, ChainBlocks, BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import fetchURL from "../../utils/fetchURL"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { queryDune } from "../../helpers/dune";


interface BancorV2Response {
  data: Array<{
    timestamp: number
    bnt: string
    usd: string
    eur: string
    eth: string
  }>
}

interface BancorV3Response {
  bnt: string;
  usd: string;
  eur: string;
  eth: string;
}
const v3Url = "https://api-v3.bancor.network/stats";

const endpoints = {
  ethereum: (date: number) =>
    `https://api-v2.bancor.network/history/volume?interval=day&start_date=${date}`,
};

const fetchV3 = async (timestamp: number): Promise<FetchResult> => {
  const res = (await fetchURL(v3Url))
  const totalVolume : BancorV3Response = res?.data.totalVolume24h;
  const totalFee: BancorV3Response = res?.data.totalFees24h; 
  return {
    timestamp,
    dailyVolume: totalVolume.usd,
    dailyFees: totalFee.usd,
  }
}

const graphs = (chain: string) =>
  async (timestamp: number, _chainBlocks: ChainBlocks): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))

    switch (chain) {
      case "ethereum":
        const { data }: BancorV2Response = await fetchURL(endpoints.ethereum(dayTimestamp))
        const volume = data.find(item => (item.timestamp / 1000) === dayTimestamp)
        if (!volume) throw new Error(`Unexpected error: No volume found for ${dayTimestamp}`)
        // convert timestamp to date format
        const date = new Date(dayTimestamp * 1000)
        const formattedDate = date.toISOString().split('T')[0]
        const fees = await queryDune("4954777", { daytime: formattedDate })
        console.log(fees)
        return {
          timestamp: dayTimestamp,
          dailyVolume: volume?.usd || "0",
          dailyFees: fees[0]['conversion_fees_usd']?.usd || "0",
        }

      default:
        throw new Error(`No adapter found for ${chain}`)
    }
  }




const adapter: BreakdownAdapter = {
  breakdown: {
    "v2.1": {
      [CHAIN.ETHEREUM]: {
        fetch: graphs("ethereum"),
        start: '2019-10-10',
      }
    },
    "v3": {
      [CHAIN.ETHEREUM]: {
        fetch: fetchV3,
        runAtCurrTime: true,
              }
    }
  }
}
export default adapter;
