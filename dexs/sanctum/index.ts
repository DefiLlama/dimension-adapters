import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances()
  const solDispensed = (
    await queryDune("3276095", {
      endTime: timestamp,
    })
  )[0].sol_dispensed;
  dailyVolume.addCGToken("solana", solDispensed);

  return { dailyVolume, timestamp, };
};

const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch,
      start: 1657756800,
      runAtCurrTime: true,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
