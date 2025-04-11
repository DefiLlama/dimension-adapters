import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances();
  const dailyRevenue = option.createBalances();

  const logs = await option.getLogs({
    target: "0x40d5ff3e218f54f4982661a0464a298cf6652351",
    eventAbi:
      "event RewardsProcessed (uint256 totalRewards, uint256 elRewards, uint256 clRewards, uint256 netRewards, uint256 fees)",
  });
  logs.map((e: any) => {
    dailyFees.addGasToken(e[0]);
    dailyRevenue.addGasToken(e[4]);
  });

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: "2024-05-10",
    },
  },
  version: 2,
};

export default adapter;
