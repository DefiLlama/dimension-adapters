import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";
import { getPrices } from "../utils/prices";

const adapter: Adapter = {
  adapter: {
    [CHAIN.FANTOM]: {
        fetch:  async (timestamp: number) => {
            const fees = (await queryDune("2843395"))[0]._col0
            const usdFees = fees * (await getPrices(["coingecko:fantom"], timestamp))["coingecko:fantom"].price;

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
