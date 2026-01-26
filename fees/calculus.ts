import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const TREASURY = "0x94D4B1003F75A953A97B8dE99137336a36E9C111";
// const TOKENPAIR_REGISTRY = "0x497f6e7eF1C0ad1E44A2DF48ee15Fa3B748EE2c6";

// const TRANSFER_EVENT =
//   "event Transfer(address indexed from, address indexed to, uint256 value)";

// const getTokenPairAddressesAbi =
//   "function getTokenPairAddresses(uint16 _id) external view returns (address, address)";


const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived(
    { options, target: TREASURY },
  )
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.BSC],
  fetch,
  start: '2025-11-01',
  methodology: {
    Fees: "Fees collected by the platform.",
    Revenue: "Fees going to the protocol treasury.",
  },
}

export default adapter;
