import { encodeBase58 } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const skateChainIds = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.BSC]: 56,
    [CHAIN.BASE]: 8453,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.SOLANA]: 901,
    [CHAIN.ECLIPSE]: 902
}

const skateDataApi = "https://data.skatechain.org/pools/stats";
const tokenDetailsApi = "https://api.amm.skatechain.org/config/deployment/pools"

const fetch = async (options: FetchOptions) => {
    let dailyVolume: any = 1000;

    // Get token details
    const token_details_response = await httpGet(tokenDetailsApi);
    const token_details = Object.values(token_details_response.data);

    // Get the swaps 
    dailyVolume = options.createBalances();
    
    const tokenVolume_options = {
        params: {
            metric: "volume",
            chainIds: skateChainIds[options.api.chain],
            startTime: options.startTimestamp,
            endTime: options.endTimestamp,
            settlementTerms: "token"
        }
    }        
    let tokenVolume = await httpGet(skateDataApi, tokenVolume_options);
    
    tokenVolume = tokenVolume.map((pool) => {
        return {
            kernel_pool_address: pool.kernel_pool_address,
            description: pool.description,
            periphery_token0_address: (options.api.chain === CHAIN.SOLANA || options.api.chain === CHAIN.ECLIPSE) ? encodeBase58(pool.periphery_token0_address) : pool.periphery_token0_address, 
            periphery_token1_address: (options.api.chain === CHAIN.SOLANA || options.api.chain === CHAIN.ECLIPSE) ? encodeBase58(pool.periphery_token1_address) : pool.periphery_token1_address,
            total_token0_volume_in: parseFloat(pool.total_token0_volume_in),
            total_token1_volume_in: parseFloat(pool.total_token1_volume_in),
        }
    })

    for (const pair of tokenVolume) {
        // Look for the matching pair by kernelPool
        const matching_pool = token_details.find(pool => pool.kernelPool.toLowerCase() === pair.kernel_pool_address.toLowerCase());
        
        // Retrieve by periphery chainId
        const matching_pool_details = matching_pool.peripheryInfo[skateChainIds[options.api.chain]];

        dailyVolume.add(pair.periphery_token0_address, pair.total_token0_volume_in * 10**(matching_pool_details['token0'].decimal));
        dailyVolume.add(pair.periphery_token1_address, pair.total_token1_volume_in * 10**(matching_pool_details['token1'].decimal));
    }
        
    return {
        dailyVolume
    }
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2025-03-24'
        },
        [CHAIN.BSC]: {
            fetch,
            start: '2025-04-07'
        },
        [CHAIN.BASE]: {
            fetch,
            start: '2025-03-17'
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2025-03-17'
        },
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-01'
        },
        [CHAIN.ECLIPSE]: {
            fetch,
            start: '2025-04-02'
        }
    }
}

export default adapter;