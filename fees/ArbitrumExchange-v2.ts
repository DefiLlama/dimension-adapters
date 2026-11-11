import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

const SWAP_FEE = 0.0025 // ArbDexPair swapFee = 25 bps
const PROTOCOL_SHARE = 0.8 // ArbDexPair _mintFee share minted to the factory feeTo Safe
const STAKER_PAYOUTS_END = 1695081600 // 2023-09-19, the feeTo Safe last funded ARX staking pools on 2023-09-18

const customLogic = ({ dailyVolume, dailyFees, fetchOptions }: any) => {
  const dailyUserFees = fetchOptions.createBalances();
  const dailyRevenue = fetchOptions.createBalances();
  const dailyProtocolRevenue = fetchOptions.createBalances();
  const dailyHoldersRevenue = fetchOptions.createBalances();
  const dailySupplySideRevenue = fetchOptions.createBalances();

  const revenue = dailyFees.clone(PROTOCOL_SHARE);
  if (fetchOptions.toTimestamp > STAKER_PAYOUTS_END) {
    dailyRevenue.addBalances(revenue, 'Swap Fees To Protocol');
    dailyProtocolRevenue.addBalances(revenue, 'Swap Fees To Protocol');
  } else {
    dailyRevenue.addBalances(revenue, 'Swap Fees To ARX Stakers');
    dailyHoldersRevenue.addBalances(revenue, 'Swap Fees To ARX Stakers');
  }
  dailyUserFees.addBalances(dailyFees, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addBalances(dailyFees.clone(1 - PROTOCOL_SHARE), 'Swap Fees To LPs');

  return {
    dailyVolume,
    dailyFees: dailyUserFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
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
  ProtocolRevenue: "80% of swap fees, kept in the protocol's fee multisig since September 19, 2023 (0% before).",
  HoldersRevenue: "80% of swap fees, paid out as staking rewards to ARX stakers until September 18, 2023 (0% since).",
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
    'Swap Fees To ARX Stakers': "80% of swap fees, paid out as staking rewards to ARX stakers until September 18, 2023.",
    'Swap Fees To Protocol': "80% of swap fees, kept in the protocol's fee multisig since September 19, 2023."
  },
  HoldersRevenue: {
    'Swap Fees To ARX Stakers': "80% of swap fees, paid out as staking rewards to ARX stakers until September 18, 2023."
  },
  ProtocolRevenue: {
    'Swap Fees To Protocol': "80% of swap fees, kept in the protocol's fee multisig since September 19, 2023."
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
