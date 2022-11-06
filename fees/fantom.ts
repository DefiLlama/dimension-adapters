import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";

const adapter: Adapter = {
  adapter: {
    [CHAIN.FANTOM]: {
        fetch:  async (timestamp: number) => {
            const ts = getTimestampAtStartOfDayUTC(timestamp)
            const dailyFees = await axios.get(`https://ftmscan.com/chart/transactionfee?output=csv`);
            const feesToday = dailyFees.data.split("\n").find((d:any)=>d.split(",")?.[1]?.slice(1, -1)==ts)
            const pricesObj = await getPrices(["coingecko:fantom"], ts);
            const usdFees = Number(feesToday.split(",")[2].slice(1, -2))/1e18*pricesObj["coingecko:fantom"].price

            return {
                timestamp,
                dailyFees: usdFees.toString(), 
                dailyRevenue: (usdFees*0.3).toString(),
            };
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
