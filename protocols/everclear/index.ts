import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const url = "https://api.everclear.org/intents?startDate=1726542000&endDate=1742108597&limit=100000";

    try {
        const response = await fetchURL(url);

  /*       if (!response || !Array.isArray(response.intents)) {
            throw new Error("Unexpected API response format.");
        } */

        let totalFeesUSD = 0; // Accumulator for total fees in USD

        // Process intents and accumulate protocol fees in USD
        for (const intent of response.intents) {
            if (intent.status !== "SETTLED_AND_COMPLETED") continue;
            

            const chain = "ethereum"; // Assuming all assets are on Ethereum --> problem, price API needs to know the chain, and not all of our intents have contract addresses of tokens deployed on ethereum
            const assetContract = intent.input_asset;

            // Ensure values are numbers
            const originAmount = intent.origin_amount ? Number(intent.origin_amount) : 0;
            const destinationAmount = intent.destination_amount ? Number(intent.destination_amount) : 0;
            const feeAmount = (originAmount - destinationAmount)/1e18;
            dailyFees.add(assetContract, feeAmount);

            // Fetch asset price in USD
            // const priceUSD = await getAssetPriceUSD(chain, assetContract);

            // Convert fee to USD and accumulate
            // totalFeesUSD += (feeAmount) * priceUSD;
        }
        console.log(dailyFees)

        // ✅ Return the total protocol fees in USD
        return {
            dailyFees, dailyRevenue: dailyFees
        };
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};

export default {
    version: 2,
    adapter: {
      [CHAIN.ETHEREUM]: {
        fetch: fetch,
        start: 1726542000,
        runAtCurrTime: false,
        meta: {
          methodology: "Accumulates the protocol fees as (originAmount - destinationAmount) converted to USD."
        }
      },
    },
};

  

// EXTRA

// Function to fetch the price of an asset in USD
/*
const PRICES_API = "https://coins.llama.fi/prices/current";

 const getAssetPriceUSD = async (chain: string, contract: string): Promise<number> => {
  try {
    const priceResponse = await fetchURL(`${PRICES_API}/${chain}:${contract}`);

    // Check if the response is properly structured
    if (!priceResponse || !priceResponse.data || !priceResponse.data.coins) {
      console.error(`Invalid response structure for ${chain}:${contract}`, priceResponse);
      return 0;  // Default to 0 if API response is malformed
    }

    const priceData = priceResponse.data.coins[`${chain}:${contract}`];

    if (!priceData || typeof priceData.price !== "number") {
      console.warn(`Price not found for ${chain}:${contract}`);
      return 0;  // Default to 0 if price is missing
    }

    return priceData.price;
  } catch (error) {
    console.error(`Error fetching price for ${chain}:${contract}`, error);
    return 0;  // Default to 0 if price fetch fails
  }
}; */
