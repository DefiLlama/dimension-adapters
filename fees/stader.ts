import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetch: FetchV2 = async (option: FetchOptions) => {
  const queries: { [key: string]: string } = {
    ethereum: "4936645",
    polygon: "4937433",
    bsc: "4937097",
  };

  const dailyFees = option.createBalances();
  const dailyRevenue = option.createBalances();
  const date = new Date(option.startOfDay * 1000).toISOString().split("T")[0];

  const res: { user_rewards: string; stader_revenue: string }[] =
    await queryDune(queries[option.chain], { target_date: date });
  res.forEach((item) => {
    dailyFees.addUSDValue(item.user_rewards);
    dailyRevenue.addUSDValue(item.stader_revenue);
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
      start: "2023-06-23",
    },
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: "2022-04-15",
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      start: "2024-02-03",
    },
  },
  version: 2,
};

export default adapter;
