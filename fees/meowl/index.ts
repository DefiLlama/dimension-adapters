import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const adapter: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: async (timestamp: number) => {
                const fees = (await queryDune("2921978", {
                    endTime: timestamp
                }))[0].fee_usd

                return {
                    timestamp,
                    dailyFees: fees.toString(),
                    dailyRevenue: fees.toString(),
                };
            },
            start: async () => 1685332595
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter;
