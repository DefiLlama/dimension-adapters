import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

const SUSN = {
    ethereum: "0xE24a3DC889621612422A64E6388927901608B91D",
    sophon: "0xb87dbe27db932bacaaa96478443b6519d52c5004",
    era: "0xB6a09d426861c63722Aa0b333a9cE5d5a9B04c4f",
    tac: "0x5Ced7F73B76A555CCB372cc0F0137bEc5665F81E"
};

const SUSN_RATE_PROVIDER = "0x3A89f87EA1D5B9fd0FEde73b5098678190D2EEaa";

// https://docs.noon.capital/noon-the-details/return-distribution
const REVENUE_RATIO = 0.2;

async function getPrices(timestamp: number): Promise<number> {
    const api = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp })
    await api.getBlock()

    const price = await api.call({ abi: "uint256:getRate", target: SUSN_RATE_PROVIDER, });
    return price / 1e18;
}

const fetch = async (options: FetchOptions) => {
    const priceToday = await getPrices(options.toTimestamp)
    const priceYesterday = await getPrices(options.fromTimestamp)

    let totalSupply = await options.api.call({ abi: "uint256:totalSupply", target: SUSN[options.chain], });

    const dailyFees = totalSupply * (priceToday - priceYesterday) / (1 - REVENUE_RATIO) / 1e18
    const dailyRevenue = dailyFees * REVENUE_RATIO
    const dailySupplySideRevenue = dailyFees - dailyRevenue

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: "Total Yields from Noon strategies",
    SupplySideRevenue: "All yields distributed to the depositors",
    Revenue: "20% of the total yields goes to the protocol",
    ProtocolRevenue: "All revenues from the protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    start: '2025-04-16',
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.SOPHON, CHAIN.ERA,],
    adapter: {
        [CHAIN.TAC]: {
            start: '2025-07-12',
        },
    },
};

export default adapter;