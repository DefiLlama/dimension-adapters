import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";
import { getPrices } from "../utils/prices";

const adapter: Adapter = {
  adapter: {
    [CHAIN.FANTOM]: {
        fetch:  async (timestamp: number) => {
            // select sum(gas_price*(gas_used/1e18)) from fantom.transactions where block_time > from_unixtime({{endTime}}) - interval '1' day and block_time < from_unixtime({{endTime}})
            const fees = (await queryDune("2849077", {
              endTime: timestamp
            }))[0]._col0
            const usdFees = fees * (await getPrices(["coingecko:fantom"], timestamp))["coingecko:fantom"].price;

            return {
                timestamp,
                dailyFees: usdFees.toString(), 
                dailyRevenue: (usdFees*0.3).toString(),
            };
        },
        start: 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
