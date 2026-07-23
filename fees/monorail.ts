import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEVMTokenTransfers } from "../helpers/token";

const MONORAIL_BRIDGE_FEE_ADDRESS = '0x1ccd30e5360552118048a9e88cb0f14a24c92015';
const MONORAIL_AGGREGATOR_ADDRESS = '0xA68A7F0601effDc65C64d9C47cA1b18D96B4352c';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getEVMTokenTransfers({ options, fromAddresses: [MONORAIL_AGGREGATOR_ADDRESS], toAddresses: [MONORAIL_BRIDGE_FEE_ADDRESS] });
  return { dailyFees, dailyRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-10-27',
  methodology: {
    Fees: "Trade fees collected on routed volumes",
    Revenue: "Trade fees collected on routed volumes"
  }
}

export default adapter;
