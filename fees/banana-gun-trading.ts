import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch:  async (timestamp: number) => {
            const fees = (await queryDune("3404031", {
              endTime: timestamp
            }))[0]._col0
            return {
                timestamp,
                dailyFees: fees.toString(), 
                dailyRevenue: fees.toString(),
            };
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
