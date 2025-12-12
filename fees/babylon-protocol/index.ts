import { FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const BABYLON_EXPLORER_API = "https://babylon.api.explorers.guru/api/v1/analytics?timeframe=6M";

async function fetch(_a:any,_b:any,options:FetchOptions): Promise<FetchResult>{
    const dailyFees = options.createBalances();

    const {data} = await fetchURL(BABYLON_EXPLORER_API);

    const todaysData = data.find((entry:any)=>entry.date ===options.dateString);
    const avgFeeInUbbn = +todaysData.avgFee.find((feeData:any)=>feeData.denom === 'ubbn').amount;

    dailyFees.addCGToken("babylon",(avgFeeInUbbn/1e6)*todaysData.txs)

    return {
        dailyFees,
        dailyRevenue: 0,
    }
}

const methodology = {
    Fees: "Transaction fees paid by users",
    Revenue: "No revenue since fees goes to validators"
};

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    chains:[CHAIN.BABYLON],
    start:'2025-06-13',
    protocolType: ProtocolType.CHAIN
}

export default adapter;