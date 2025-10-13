import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { httpPost } from "../../utils/fetchURL";

const ARB_USDT = ADDRESSES.arbitrum.USDT;
const API_ENDPOINT = "https://backend.lsp.finance/v1/daily";

interface DailyFeeResponse {
    result: {
        daily_fee: string;
        daily_market_fee: string;
        daily_stake_fee: string;
        time: string;
    };
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const apiResponse = await httpPost(API_ENDPOINT, {}) as DailyFeeResponse;

    const marketFees = Number(apiResponse.result.daily_market_fee) * 1e6;
    const totalRevenue = Number(apiResponse.result.daily_fee) * 1e6;

    dailyFees.add(ARB_USDT, marketFees);
    dailyRevenue.add(ARB_USDT, totalRevenue);

    return { dailyFees, dailyRevenue };
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-11-18',
        },
    },
    version: 2,
    methodology: {
        Fees: "LSP charges a 0.5% fee (in USDT) on market transactions, and takes 10% fee on users staking rewards.",
        Revenue: "LSP charges a 0.5% fee (in USDT) on market transactions, and takes 10% fee on users staking rewards.",
    },
};

export default adapter;