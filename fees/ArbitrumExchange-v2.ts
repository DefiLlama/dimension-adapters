import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

// ArbDexPair (Sourcify exact match, e.g. 0x101009f8a54f52d7210bcb755aba44984ffa2fb7) charges a fixed `swapFee = 25` (0.25%, no setter).
// `_mintFee` mints 20/(5,20) of the sqrt(k) growth to factory feeTo => 80% of swap fees to the protocol, 20% stay with LPs.
// feeTo is a 2-of-5 Safe (0xe8ffe751dea181025a9acf3d6bde8cda5380f53f), set 2023-03-07 and never changed. Docs say this share funds
// ARX staking, but the Safe has moved none of these LP tokens since 2024-03-06, so it is counted as protocol revenue, not holders revenue.
const SWAP_FEE = 0.0025
const PROTOCOL_SHARE = 0.8

const customLogic = ({ dailyVolume, dailyFees, fetchOptions }: any) => {
  const dailyUserFees = fetchOptions.createBalances();
  const dailyRevenue = fetchOptions.createBalances();
  const dailySupplySideRevenue = fetchOptions.createBalances();

  dailyUserFees.addBalances(dailyFees, METRIC.SWAP_FEES);
  dailyRevenue.addBalances(dailyFees.clone(PROTOCOL_SHARE), 'Swap Fees To Protocol');
  dailySupplySideRevenue.addBalances(dailyFees.clone(1 - PROTOCOL_SHARE), 'Swap Fees To LPs');

  return {
    dailyVolume,
    dailyFees: dailyUserFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = getUniV2LogAdapter({
  factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c',
  fees: SWAP_FEE,
  customLogic,
});

const methodology = {
  Fees: "0.25% swap fee paid by traders on every trade.",
  UserFees: "Traders pay a 0.25% swap fee on every trade.",
  Revenue: "80% of swap fees (0.20% of volume), minted as LP tokens to the protocol's fee multisig.",
  ProtocolRevenue: "80% of swap fees (0.20% of volume), minted as LP tokens to the protocol's fee multisig.",
  SupplySideRevenue: "20% of swap fees (0.05% of volume), kept in the pools for liquidity providers.",
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: "0.25% swap fee paid by traders on every trade."
  },
  Fees: {
    [METRIC.SWAP_FEES]: "0.25% swap fee paid by traders on every trade."
  },
  Revenue: {
    'Swap Fees To Protocol': "80% of swap fees, minted as LP tokens to the protocol's fee multisig."
  },
  ProtocolRevenue: {
    'Swap Fees To Protocol': "80% of swap fees, minted as LP tokens to the protocol's fee multisig."
  },
  SupplySideRevenue: {
    'Swap Fees To LPs': "20% of swap fees, kept in the pools for liquidity providers."
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2023-05-09',
  methodology,
  breakdownMethodology,
};

export default adapter;
