import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";

const adapter: Adapter = {
  adapter: {
    [CHAIN.TRON]: {
        fetch:  async (timestamp: number) => {
            const ts = getTimestampAtStartOfDayUTC(timestamp)
            const today = new Date(ts * 1000).toISOString().substring(0, "2022-11-03".length)
            const dailyFees = await axios.get(`https://apilist.tronscanapi.com/api/turnover?size=1000&start=1575158400000&end=${Date.now()}&type=0`);
            const trxFeesToday = dailyFees.data.data.find((d:any)=>d.day===today)
            const pricesObj = await getPrices(["coingecko:tron"], ts);
            const usdFees = (trxFeesToday.total_trx_burn*pricesObj["coingecko:tron"].price).toString() // excludes trx burned for USDD

            return {
                timestamp,
                dailyFees: usdFees, 
                dailyRevenue: usdFees,
                dailyHoldersRevenue: usdFees,
            };
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
