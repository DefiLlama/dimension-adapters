import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: async (timestamp: number) => {
                const fees = 0;
                return {
                    timestamp,
                    dailyFees: fees.toString(),
                    dailyRevenue: fees.toString(),
                };
            },
            start: 1685332595
        },
    }
}

export default adapter;
