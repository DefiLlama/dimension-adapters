import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const eventAbi = "event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)";
const contractAddress = "0x4e5EF0196ed5C5bc936E31C7c837d315E66059fF";

const fetchHemiFees = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const events = await options.getLogs({
    target: contractAddress,
    eventAbi: eventAbi,
  });

  events.forEach((event: any) => {
    dailyVolume.addGasToken(event.price);
  });

  // Calculate fees as 2% of total volume (simplified approach)
  const dailyFees = dailyVolume.clone(0.02);

  return {
    dailyFees,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HEMI]: {
      fetch: fetchHemiFees,
      start: '2025-01-01',
    },
  },
  methodology: {
    Fees: "2% fee charged on all NFT marketplace sales",
    Volume: "Total volume of NFT sales on the marketplace"
  }
};

export default adapter;