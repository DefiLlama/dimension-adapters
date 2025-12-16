import { FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();

    const { data } = await fetchURL("https://babylon.api.explorers.guru/api/v1/analytics?timeframe=6M");

    const todaysData = data.find((entry: any) => entry.date === options.dateString);
    const avgFeeInUbbn = todaysData.avgFee.find((entry: any) => entry.denom === "ubbn").amount;
    const { txs } = todaysData;

    dailyFees.addCGToken("babylon", txs * avgFeeInUbbn / 1e6);

    return {
        dailyFees,
        dailyRevenue: 0
    }
}

const methodology = {
    Fees: "Transaction fees paid by users",
    Revenue: "No revenue as fees go to validators"
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    start: '2025-06-16',
    chains: [CHAIN.BABYLON],
    protocolType: ProtocolType.CHAIN
};

export default adapter;