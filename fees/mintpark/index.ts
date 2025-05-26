import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchHemiFees = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  // Create balance objects using the helper
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const query = gql`
    query ($from: Int!, $to: Int!) {
      listingSolds(
        where: { blockTimestamp_gte: $from, blockTimestamp_lt: $to }
        first: 1000
        orderBy: blockTimestamp
        orderDirection: desc
      ) {
        price
        # paymentToken  # Uncomment if your subgraph has this field
        blockTimestamp
      }
    }
  `;

  try {
    const data = await request(
      "https://api.studio.thegraph.com/query/108155/mint-park-marketplace/v0.0.2",
      query,
      { from: startTimestamp, to: endTimestamp }
    );

    // Process each sale
    data.listingSolds.forEach((sale: any) => {
      const salePrice = sale.price; // Keep as string to maintain precision



      dailyVolume.addGasToken(salePrice);

      const fee = (BigInt(salePrice) * BigInt(2)) / BigInt(100);
      dailyFees.addGasToken(fee.toString());
    });

    return {
      dailyFees,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching data:", error);
    // Return empty balances on error
    return {
      dailyFees,
      dailyVolume,
    };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HEMI]: {
      fetch: fetchHemiFees,
      start: '2025-01-01', // Use date string format instead of timestamp
      meta: {
        methodology: {
          Fees: "2% fee charged on all NFT marketplace sales",
          Volume: "Total volume of NFT sales on the marketplace"
        }
      }
    },
  },
};

export default adapter;