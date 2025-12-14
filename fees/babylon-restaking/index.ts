import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const PREVIOUS_INFLATION_REDUCTION_TIMESTAMP = 1763078400;
let STAKING_REWARDS_INFLATION = 0;

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    if (options.fromTimestamp < PREVIOUS_INFLATION_REDUCTION_TIMESTAMP)
        STAKING_REWARDS_INFLATION = 0.04;
    else
        STAKING_REWARDS_INFLATION = 0.0335;

    const { inflation_rate } = await fetchURL("https://babylon-archive.nodes.guru/api/cosmos/mint/v1beta1/inflation_rate");

    if(inflation_rate!=0.055)
        throw new Error("Net inflation rate has changed plz check staking rewards inflation");

    const durationWrtYear = (options.toTimestamp-options.fromTimestamp)/(365*24*60*60);

    const { data } = await fetchURL("https://babylon.api.explorers.guru/api/v1/analytics?timeframe=6M");

    const todaysSupply = + data.find((entry:any) => entry.date).supply/1e6;

    dailyFees.addCGToken("babylon",todaysSupply*STAKING_REWARDS_INFLATION*durationWrtYear)

    return {
        dailyFees,
        dailyRevenue:0,
    }
}

const methodology = {
    Fees:'BTC staking and co-staking rewards distrubuted in babylon tokens',
    Revenue: 'No revenue'
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.BABYLON],
    methodology,
    start: '2025-06-05'
};

export default adapter;