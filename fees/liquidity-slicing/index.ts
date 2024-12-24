import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { httpPost } from "../../utils/fetchURL";

const ARB_USDT = ADDRESSES.arbitrum.USDT;
const API_ENDPOINT = "https://backend.lsp.finance/v1/daily";

interface DailyFeeResponse {
    result: {
        daily_fee: string;
        time: string;
    };
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    
    const apiResponse = await httpPost(API_ENDPOINT, {}) as DailyFeeResponse;
    const dailyFee = Number(apiResponse.result.daily_fee) * 1e6;
    
    dailyFees.add(ARB_USDT, dailyFee);
    return { dailyFees };
}

const adapter: Adapter = {
    adapter: {
        [ARBITRUM]: {
            fetch,
            start: '2024-11-18',
            meta: {
                methodology: "LSP charges a 0.5% fee (in USDT) on market transactions, and takes 10% fee on users staking rewards.",
            },
        },
    },
    version: 2,
};

export default adapter;