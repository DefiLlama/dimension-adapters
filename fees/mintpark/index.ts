import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEventLogs } from "@defillama/sdk";

const fetchHemiFees = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  // Create balance objects using the helper
  const dailyVolume = options.createBalances();

  // Event signature for listing sold events
  // You'll need to replace this with the actual event signature from your marketplace contract
  const eventSignature = "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

  const contractAddress = "0x4e5EF0196ed5C5bc936E31C7c837d315E66059fF";

  try {
    // Fetch event logs from the blockchain
    const logs = await getEventLogs({
      target: contractAddress,
      topic: eventSignature,
      fromBlock: await options.getFromBlock(),
      toBlock: await options.getToBlock(),
      chain: CHAIN.HEMI
    });

   // Process each sale event
    logs.forEach((log: any) => {
      // The third parameter (index 2) in ListingSold event is the price
      // Event: ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)
      // Price is the third topic (non-indexed) so it's in the data field
      // For indexed parameters: topics[1] = listingId, topics[2] = buyer
      // For non-indexed parameters: data contains the price
      const salePrice = log.data; // Price is stored in data field
      dailyVolume.addGasToken(salePrice);
    });


    // Calculate fees as 2% of total volume (simplified approach)
    const dailyFees = dailyVolume.clone(0.02);

    return {
      dailyFees,
      dailyVolume,
    };
  } catch (error) {
    console.error("Error fetching event logs:", error);
    // Return empty balances on error
    return {
      dailyFees: options.createBalances(),
      dailyVolume: options.createBalances(),
    };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HEMI]: {
      fetch: fetchHemiFees,
      start: '2025-01-01',
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