import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const CSC_STATS_API = "https://www.coinex.net/res/statistics/transaction?start_time=oldest&end_time=latest"

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();

    const response = await fetchURL(CSC_STATS_API);
    const todaysData = response.data.find((item: any) => item.timestamp === options.startOfDay);

    if (!todaysData) {
        throw new Error(`No data found for ${options.dateString}`);
    }

    const transactionCount = todaysData.add;
    const averageTransactionFee = Number(todaysData.average_fee);

    dailyFees.addCGToken('coinex-token', transactionCount * averageTransactionFee);

    return { dailyFees, dailyRevenue: 0, dailyHoldersRevenue: 0 };
}

const methodology = {
    Fees: 'Fees paid by users for transactions on the CSC chain',
    Revenue: 'No revenue, as transactions fees aren\'t burnt',
    HoldersRevenue: 'No holdersrevenue, as transactions fees aren\'t burnt',
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.CSC],
    start: '2021-06-25',
    methodology,
    protocolType: ProtocolType.CHAIN,
}

export default adapter;
