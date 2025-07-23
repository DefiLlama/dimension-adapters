import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const adapter: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: async () => {
                const fees = 0;
                return {
                    dailyFees: fees.toString(),
                    dailyRevenue: fees.toString(),
                };
            },
            start: '2023-05-29',
            meta: {
                methodology: {
                    Fees: "Fees paid by users while using Meowl Discord bot.",
                    Revenue: "All fees are revenue.",
                }
            }
        },
    },
    version: 2
}

export default adapter;
