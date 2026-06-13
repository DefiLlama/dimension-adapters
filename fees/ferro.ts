import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSaddleVolume } from "../helpers/saddle";

const pools = [
  '0xe8d13664a42B338F009812Fa5A75199A865dA5cD',
  '0xa34C0fE36541fB085677c36B4ff0CCF5fa2B32d6',
  '0x1578C5CF4f8f6064deb167d1eeAD15dF43185afa',
  '0x5FA9412C2563c0B13CD9F96F0bd1A971F8eBdF96',
];

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await getSaddleVolume(options, pools);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(0.2),
    dailyHoldersRevenue: dailyRevenue.clone(0.8),
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Ferro charges a 0.04% fee on all swaps",
  Revenue: "0.02% of swap volume goes to the protocol, with 0.016% distributed to token holders and 0.004% to the treasury",
  ProtocolRevenue: '0.004% of swap volume goes to the protocol',
  HoldersRevenue: '0.016% of swap volume goes to the token holders',
  SupplySideRevenue: "0.02% of swap volume is distributed to liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "0.04% fee charged on all token swaps through Ferro's StableSwap pools",
  },
  UserFees: {
    "Swap Fees": "0.04% fee paid by users on each swap",
  },
  Revenue: {
    "Protocol Share": "0.02% of swap volume retained by the protocol (0.016% to token holders + 0.004% to treasury)",
  },
  HoldersRevenue: {
    "Token Holder Distributions": "0.016% of swap volume distributed to FER token holders",
  },
  SupplySideRevenue: {
    "LP Fees": "0.02% of swap volume distributed to liquidity providers in the pools",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.CRONOS],
  fetch,
  start: '2022-08-29',
  methodology,
  breakdownMethodology,
};

export default adapter;
