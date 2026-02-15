import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

const customLogic = ({ dailyVolume, dailyFees, filteredPairs, fetchOptions }: any) => {
  // Create labeled balances for breakdown
  const dailyUserFees = fetchOptions.createBalances();
  const dailyHoldersRevenue = fetchOptions.createBalances();

  // Add all fees with appropriate labels
  dailyUserFees.addBalances(dailyFees, METRIC.SWAP_FEES);
  dailyHoldersRevenue.addBalances(dailyFees, METRIC.SWAP_FEES);

  return {
    dailyVolume,
    dailyFees: dailyUserFees,
    dailyUserFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
  };
};

const fetch = getUniV2LogAdapter({
  factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c',
  customLogic,
});

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "No protocol revenue.",
  SupplySideRevenue: "LPs have no revenue.",
  HoldersRevenue: "ARX stakers receive all fees."
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: "0.25% swap fee paid by users on each trade"
  },
  Fees: {
    [METRIC.SWAP_FEES]: "0.25% swap fee paid by users on each trade"
  },
  HoldersRevenue: {
    [METRIC.SWAP_FEES]: "100% of swap fees are distributed to ARX token stakers; no fees go to liquidity providers or protocol"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;