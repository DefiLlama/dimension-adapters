import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const adapter: Adapter = {
  adapter: {
    [CHAIN.FANTOM]: {
        fetch:  async (timestamp: number , _: ChainBlocks, { createBalances }: FetchOptions) => {
            // select sum(gas_price*(gas_used/1e18)) from fantom.transactions where block_time > from_unixtime({{endTime}}) - interval '1' day and block_time < from_unixtime({{endTime}})
            const fees = (await queryDune("2849077", {
              endTime: timestamp
            }))[0]._col0
            const dailyFees = createBalances()
            dailyFees.addGasToken(fees * 1e18)
            const dailyRevenue = dailyFees.clone(0.3)
            return { dailyFees, dailyRevenue, timestamp }
        },
        start: 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
