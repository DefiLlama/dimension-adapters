import fetchURL from "../../utils/fetchURL"
import { Chain, FetchOptions } from "../../adapters/types";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


type ChainMap = {
  [chain: string | Chain]: string;
}
const historicalVolumeEndpoints: ChainMap = {
  [CHAIN.BSC]: "https://api.kiloex.io/common/queryTradeSummary",
  [CHAIN.OP_BNB]: "https://opapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.MANTA]: "https://mantaapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.TAIKO]: "https://taikoapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.BSQUARED]: "https://b2api.kiloex.io/common/queryTradeSummary",
  [CHAIN.BASE]: "https://baseapi.kiloex.io/common/queryTradeSummary",
};

interface IVolume {
  time: number;
  dayTradeAmount: string;
  totalTradeAmount: string
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const historicalVolume: IVolume[] = (await fetchURL(historicalVolumeEndpoints[options.chain]));

  const dailyVolume = historicalVolume
    .find(item => item.time === options.startOfDay)?.dayTradeAmount

  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2023-06-12' },
    [CHAIN.OP_BNB]: { start: '2023-10-07' },
    [CHAIN.MANTA]: { start: '2023-11-01', deadFrom: '2026-05-12' },
    [CHAIN.TAIKO]: { start: '2024-05-30', deadFrom: '2026-02-10' },
    [CHAIN.BSQUARED]: { start: '2024-07-30', deadFrom: '2026-02-24' },
    [CHAIN.BASE]: { start: '2024-10-09' },
  },
};

export default adapter;
