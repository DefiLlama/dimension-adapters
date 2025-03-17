import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Define the fetch function
const fetch = async () => {
    const url = "https://api.everclear.org/intents?startDate=1741590197&endDate=1741676597";
    
    try {
        const response = await fetchURL(url);

        if (!response || !Array.isArray(response.intents)) {
            throw new Error("Unexpected API response format.");
        }

        // Accumulate protocol fees per asset
        const feesByAsset = {};

        response.intents
            .filter(intent => intent.status === "SETTLED_AND_COMPLETED")
            .forEach(intent => {
                const assetKey = `ethereum:${intent.input_asset}`;

                // Ensure values are numbers
                const originAmount = intent.origin_amount ? Number(intent.origin_amount) : 0;
                const destinationAmount = intent.destination_amount ? Number(intent.destination_amount) : 0;

                const fee = originAmount - destinationAmount;

                // Initialize if not exists
                if (!feesByAsset[assetKey]) {
                    feesByAsset[assetKey] = 0;
                }

                // Accumulate fees
                feesByAsset[assetKey] += fee;
            });

            //a
        // Convert number values to strings for JSON compatibility
        Object.keys(feesByAsset).forEach(key => {
            feesByAsset[key] = feesByAsset[key].toString();
        });

        // ✅ Return fees inside the "dailyFees" key
        return {
            dailyFees: feesByAsset
        };
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};



// Export the adapter for use in the main application

export default {
    version: 2,
    adapter: {
      [CHAIN.ETHEREUM]: {
        fetch: fetch,
        start: 0,
        runAtCurrTime: true,
        meta: {
          methodology: "Accumulates the protocol fees as originAmount - destinationAmount for settled intents."
        }
      },
    },
};
  

/* 
const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async (_t: any, _b: any, options: FetchOptions) => {
        const dailyFees = await getEverclearIntents(options);
        return {
          timestamp: options.startOfDay,
          dailyFees: dailyFees,
        };
      },
        start: 0,
      },
    },
  };
  
export default adapter;
 */  


/*
const EVERCLEAR_API = "https://api.everclear.org/intents";
const PRICES_API = "https://coins.llama.fi/prices/current";

// Function to fetch asset prices from DefiLlama
const getAssetPriceUSD = async (chain: string, contract: string): Promise<number> => {
  try {
    const priceResponse = await fetchURL(`${PRICES_API}/${chain}:${contract}`);
    return priceResponse.data.coins[`${chain}:${contract}`]?.price || 0;
  } catch (error) {
    console.error(`Error fetching price for ${chain}:${contract}`, error);
    return 0;  // Default to 0 if price fetch fails
  }
};
*/
// ----------------




// ------------------

/* 
const fetch = async (timestamp: number) => {
    const startDate = timestamp - 86400; // 1 day before
    const endDate = timestamp;

    try {
        const response = await fetchURL(`${EVERCLEAR_API}?startDate=${startDate}&endDate=${endDate}`);
        console.log("API Response:", response.data); // Debugging output

        if (!response.data || !response.data.intents) {
            console.error("Unexpected API response:", response.data);
            return { timestamp, dailyVolume: 0, dailyFees: 0, dailyRevenue: 0 };
        }

        const intents = response.data.intents;
        let totalVolumeUSD = 0;
        let totalFeesUSD = 0;

        for (const intent of intents) {
            if (intent.origin_amount && intent.destination_amount) {
                const originAmount = parseFloat(intent.origin_amount);
                const destinationAmount = parseFloat(intent.destination_amount);
                const fee = originAmount - destinationAmount;

                const inputChain = intent.origin.toLowerCase();
                const inputAsset = intent.input_asset;

                const inputPriceUSD = await getAssetPriceUSD(inputChain, inputAsset);
                const originAmountUSD = originAmount * inputPriceUSD;
                const feeUSD = fee * inputPriceUSD;

                totalVolumeUSD += originAmountUSD;
                totalFeesUSD += feeUSD;
            }
        }

        return {
            timestamp,
            dailyVolume: totalVolumeUSD,
            dailyFees: totalFeesUSD,
            dailyRevenue: totalFeesUSD,
        };
    } catch (error) {
        console.error("Error fetching data:", error);
        return { timestamp, dailyVolume: 0, dailyFees: 0, dailyRevenue: 0 };
    }
};
 */
  
/* const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: async () => 1726455600 },
    [CHAIN.OPTIMISM]: { fetch, start: async () => 1726455600 },
    [CHAIN.BSC]: { fetch, start: async () => 1726455600 },
    [CHAIN.UNICHAIN]: { fetch, start: async () => 1726455600 },
    [CHAIN.POLYGON]: { fetch, start: async () => 1726455600 },
    [CHAIN.ZKSYNC]: { fetch, start: async () => 1726455600 },
    [CHAIN.RONIN]: { fetch, start: async () => 1726455600 },
    [CHAIN.BASE]: { fetch, start: async () => 1726455600 },
    [CHAIN.APECHAIN]: { fetch, start: async () => 1726455600 },
    [CHAIN.MODE]: { fetch, start: async () => 1726455600 },
    [CHAIN.ARBITRUM]: { fetch, start: async () => 1726455600 },
    [CHAIN.AVAX]: { fetch, start: async () => 1726455600 },
    [CHAIN.ZIRCUIT]: { fetch, start: async () => 1726455600 },
    [CHAIN.LINEA]: { fetch, start: async () => 1726455600 },
    [CHAIN.BLAST]: { fetch, start: async () => 1726455600 },
    [CHAIN.TAIKO]: { fetch, start: async () => 1726455600 },
    [CHAIN.SCROLL]: { fetch, start: async () => 1726455600 },
  },
}; */


