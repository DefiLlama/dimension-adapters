import { encodeBase58, dataSlice, getAddress } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const skateChainIds = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.BSC]: 56,
    [CHAIN.BASE]: 8453,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.SOLANA]: 901,
    [CHAIN.ECLIPSE]: 902,
    [CHAIN.HYPERLIQUID]: 999,
    [CHAIN.PLUME]: 98866,
    [CHAIN.MANTLE]: 5000
}

const skateDataApi = "https://data.skatechain.org/pools/stats";
const tokenDetailsApi = "https://api.amm.skatechain.org/config/deployment/pools"

const fetch = async (options: FetchOptions) => {
    // Get token details
    const token_details_response = await httpGet(tokenDetailsApi);
    const token_details = Object.values(token_details_response.data);

    // Get the swaps 
    let dailyVolume = options.createBalances();

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

    tokenVolume = tokenVolume.data.map((pool) => {
        return {
            kernel_pool_address: pool.kernel_pool_address,
            description: pool.description,
            periphery_token0_address: (options.api.chain === CHAIN.SOLANA || options.api.chain === CHAIN.ECLIPSE)
                ? encodeBase58(pool.periphery_token0_address)
                : getAddress(dataSlice(pool.periphery_token0_address, 12)), // Convert bytes32 Address to bytes20 Address
            periphery_token1_address: (options.api.chain === CHAIN.SOLANA || options.api.chain === CHAIN.ECLIPSE)
                ? encodeBase58(pool.periphery_token1_address)
                : getAddress(dataSlice(pool.periphery_token1_address, 12)), // Convert bytes32 Address to bytes20 Address
            total_token0_volume_in: parseFloat(pool.total_token0_volume_in),
            total_token1_volume_in: parseFloat(pool.total_token1_volume_in),
        }
    })

    for (const pair of tokenVolume) {
        try {
            // Look for the matching pair by kernelPool
            const matching_pool = token_details.find(pool => pool.kernelPool.toLowerCase() === pair.kernel_pool_address.toLowerCase());
            // Retrieve by periphery chainId
            const matching_pool_details = matching_pool.peripheryInfo[skateChainIds[options.api.chain]];

            dailyVolume.add(pair.periphery_token0_address, pair.total_token0_volume_in * 10 ** (matching_pool_details['token0'].decimal));
            dailyVolume.add(pair.periphery_token1_address, pair.total_token1_volume_in * 10 ** (matching_pool_details['token1'].decimal));
        } catch (e) {
            // Silently fail
            // console.log("Error: ", e);
        }
    }

    return {
        dailyVolume
    }
};

const methodology = {
    "Volume": "Describes the amount of tokens swapped into the pool."
}

const adapter: SimpleAdapter = {
    methodology,
    version: 2,
    fetch,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2025-03-24', },
        [CHAIN.BSC]: { start: '2025-04-07', },
        [CHAIN.BASE]: { start: '2025-03-17', },
        [CHAIN.ARBITRUM]: { start: '2025-03-17', },
        [CHAIN.SOLANA]: { start: '2025-04-01', },
        [CHAIN.ECLIPSE]: { start: '2025-04-02', },
        [CHAIN.HYPERLIQUID]: { start: '2025-05-28', },
        [CHAIN.PLUME]: { start: '2025-06-02', },
        [CHAIN.MANTLE]: { start: '2025-05-28', }
    },
}

export default adapter;