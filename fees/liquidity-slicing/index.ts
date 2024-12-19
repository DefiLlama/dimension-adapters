import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { httpPost } from "../../utils/fetchURL";

const ARB_USDT = ADDRESSES.arbitrum.USDT;
const FEE_RECEIVER_ADDRESS = "0xC565D0c19c8eC2Eb2e09D18a9f3348570fDadB79";
const API_ENDPOINT = "https://backend.lsp.finance/v1/userPortfolio";

interface PoolData {
    stake_amount_usd: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    
    const balance = await options.api.call({
        target: ARB_USDT,
        abi: 'erc20:balanceOf',
        params: [FEE_RECEIVER_ADDRESS]
    });
    
    const apiResponse = await httpPost(API_ENDPOINT, {
        user_address: FEE_RECEIVER_ADDRESS
    });
    
    const totalStakeUsd = apiResponse.result.reduce((sum: number, pool: PoolData) => 
        sum + Number(pool.stake_amount_usd), 0);
    
    dailyFees.add(ARB_USDT, balance);
    dailyFees.add(ARB_USDT, totalStakeUsd * 1e6);
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