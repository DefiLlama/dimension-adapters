import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const url = "https://api.orbiter.finance/sdk/routers/v2";

  try {
    const response = await fetchURL(url);

    let totalFeesUSD = 0; // Accumulator for total fees in USD

    for (const intent of response.intents) {
        if (intent.status !== "SETTLED_AND_COMPLETED") continue;
        
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
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 0,
      runAtCurrTime: false,
      meta: {
        methodology: "Accumulates the protocol fees as (originAmount - destinationAmount) converted to USD."
    },
  },
}
}