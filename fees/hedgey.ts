


import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
    const dailyFees = await addGasTokensReceived({
        multisig: "0x9f5E6a2a82383edb4557278355348Da1fC49ADC5",
        options,
    })

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: [CHAIN.ETHEREUM, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.BSC, CHAIN.SCROLL].reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: fetch,
            meta: {
                methodology: {
                    Fees: "Fees paid by users using payment services.",
                    Revenue: "Fees paid by users using payment services.",
                }
            }
        },
    }), {})
};

export default adapter;
