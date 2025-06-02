import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url: string = "https://tidelabs.io:2121/defillama/strike-finance/fees";

const fetch = async (_:number, _t: any, options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { dailyFees, dailyRevenue, dailyVolume },
  } = await axios.get(url);
  const dailyFeesUSD = options.createBalances();
  const dailyRevenueUSD = options.createBalances();
  const dailyVolumeUSD = options.createBalances();
  dailyFeesUSD.addCGToken('cardano', Number(dailyFees));
  dailyRevenueUSD.addCGToken('cardano', Number(dailyRevenue));
  dailyVolumeUSD.addCGToken('cardano', Number(dailyVolume));
  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
    dailyVolume: dailyVolumeUSD,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2024-05-16',
      runAtCurrTime: true,
    },
  },
  allowNegativeValue: true,
};

export default adapter;
