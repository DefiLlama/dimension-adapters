import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";


interface IFees {
  date: string;
  total_tx_fees: number;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
        fetch:  async (timestamp: number) => {
            const ts = getTimestampAtStartOfDayUTC(timestamp)
            const today = new Date(ts * 1000).toISOString().split('T')[0].split('-').reverse().join('-');

            const dailyFees: IFees = (await axios.get(`https://hyper.solana.fm/v3/tx-fees?date=${today}`)).data;
            const solanaFee = dailyFees.total_tx_fees
            const pricesObj = await getPrices(["coingecko:solana"], ts);
            const usdFees = (solanaFee/1e8 * pricesObj["coingecko:solana"].price).toString()

            return {
                timestamp,
                totalFees: "0",
                dailyFees: usdFees.toString(),
                totalRevenue: "0",
                dailyRevenue: "0",
            };
        },
        start: async () => 1610841600
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
