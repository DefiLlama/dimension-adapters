import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { Adapter, ProtocolType } from "../adapters/types";

export function blockscoutFeeAdapter(chain:string, url:string, coin:string){
    const adapter: Adapter = {
        adapter: {
          [chain]: {
              fetch:  async (timestamp: number) => {
                    const ts = getTimestampAtStartOfDayUTC(timestamp)
                  const date = new Date(ts*1000).toISOString().slice(0, "2011-10-05".length)
                  const fees = await axios.get(`${url}&date=${date}`)
                  const prices = await getPrices([coin], );
                  const usdFees = Number(fees.data.result)/1e18*prices[coin].price

                  return {
                      timestamp,
                      dailyFees: usdFees.toString(), 
                  };
              },
              start: async () => 1575158400
          },
      },
        protocolType: ProtocolType.CHAIN
      }
    
    return adapter
}
