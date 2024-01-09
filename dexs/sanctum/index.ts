import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
import { getPrices } from "../../utils/prices";

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const solDispensed = (
    await queryDune("3276095", {
      endTime: timestamp,
    })
  )[0].sol_dispensed;
  const dailyVolume =
    solDispensed *
    (await getPrices(["coingecko:solana"], timestamp))["coingecko:solana"]
      .price;

  return {
    dailyVolume: `${dailyVolume}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch,
      start: async () => 1657756800,
    },
  },
};

export default adapter;
