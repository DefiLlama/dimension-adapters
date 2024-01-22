import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { Adapter, ProtocolType } from "../adapters/types";


export async function getEtherscanFees(timestamp: number, url:string, coin:string) {
    const ts = getTimestampAtStartOfDayUTC(timestamp)
    const dailyFees = await axios.post(url, { responseType: 'blob', headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
            "Content-Type": "text/csv; charset=utf-8",
            "Accept" : "text/csv; charset=utf-8",
            "origin": url,
        }});
    const feesToday = dailyFees.data?.split("\n").find((d: any) => d?.split(",")?.[1]?.slice(1, -1) == ts)
    const pricesObj = await getPrices([coin], ts);
    return Number(feesToday?.split(",")[2].slice(1, -2)) / 1e18 * pricesObj[coin].price
}

export function etherscanFeeAdapter(chain:string, url:string, coin:string){
    const adapter: Adapter = {
        adapter: {
          [chain]: {
              fetch:  async (timestamp: number) => {
                  const usdFees = await getEtherscanFees(timestamp, url, coin)

                  return {
                      timestamp,
                      dailyFees: usdFees.toString(),
                  };
              },
              start: async () => 1690761600
          },
      },
        protocolType: ProtocolType.CHAIN
      }

    return adapter
}

/*
Broken fees:
- Boba chart is empty
- Cronos has a weird drop + their current fees are way too long, seems wrong
*/
