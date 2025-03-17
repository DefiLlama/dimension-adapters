import { ETHER_ADDRESS } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const value = await queryDune("4863430", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    receiver: "0x61131513C4fF67Bcd3318eb309834D26A3509Cdb",
  });

  dailyFees.add(ETHER_ADDRESS, value[0]["Revenue"]);

  dailyVolume.add(ETHER_ADDRESS, value[0]["Revenue"] * 100);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: "2023-09-16", // Block number from which data can be fetched
    },
  },
};

export default adapter;
