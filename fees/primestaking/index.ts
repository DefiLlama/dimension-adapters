import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const PS_XDC = "0x9b8e12b0bac165b86967e771d98b520ec3f665a6";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const rewardAddedLogs = await options.getLogs({
    target: PS_XDC,
    eventAbi: "event RewardAdded(uint256 reward)",
  });

  for (const log of rewardAddedLogs) {
    dailyFees.addGasToken(log.reward, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addGasToken(log.reward, METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.XDC]: {
      fetch,
      start: "2025-06-13",
    },
  },
  methodology: {
    Fees: "XDC rewards deposited into the PrimeStakedXDC (psXDC) contract through RewardAdded events.",
    SupplySideRevenue: "Rewards funded into the psXDC contract and distributed to psXDC holders. The psXDC contract does not expose a protocol fee split.",
  },
};

export default adapter;
