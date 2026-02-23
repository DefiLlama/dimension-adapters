import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FEE_RECIPIENT = '0xea8cd5684f2a44a593975cf42f5a88f27f21c513';
const USDC = '0x0b2c639c533813f4aa9d7837caf62653d097ff85';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_RECIPIENT,
    token: USDC,
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: '2025-06-05',
  methodology: {
    Fees: "Total fees from card purchases Virtual, Signature, Premium.",
    Revenue: "Total fees from card purchases Virtual, Signature, Premium.",
    ProtocolRevenue: "Total fees from card purchases Virtual, Signature, Premium.",
  },
};

export default adapter;