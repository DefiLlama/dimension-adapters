import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FEE_RECIPIENT = '0xea8cd5684f2a44a593975cf42f5a88f27f21c513';
const SOURCE_ADDRESSES = [
  '0xa66b23D9a8a46C284fa5b3f2E2b59Eb5cc3817F4', //crossmint treasury
  '0x9C8B5b82FD99c6e46c9DA84d9A1bf176AAbdc16D', //daimo pay executor
  '0x9C8B5b82FD99c6e46c9DA84d9A1bf176AAbdc16D', //daimo pay executor - old
  '0xa7F0804632966D94292fe0deb8F2a93f202e2527', //tria core sale
  '0x123ae52505570Ba1300aA4519722f5963aeDE10e', //tria card booking
];
const USDC = '0x0b2c639c533813f4aa9d7837caf62653d097ff85';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    fromAdddesses: SOURCE_ADDRESSES,
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
  pullHourly: true,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: '2025-06-05',
  methodology: {
    Fees: "Total fees from membership bookings and card purchases Virtual, Signature, Premium",
    Revenue: "Total fees from membership bookings and card purchases Virtual, Signature, Premium",
    ProtocolRevenue: "Total fees from membership bookings and card purchases Virtual, Signature, Premium",
  },
};

export default adapter;