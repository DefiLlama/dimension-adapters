import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = `https://1dex.com/api/v1/24h-trade-info`;

interface IVolume {
  volume_usd: string;
}
const graph = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    let volume = 0;
    if (chain === CHAIN.EOS) {
      const reponse: IVolume = (await fetchURL(endpoint))?.data;
      volume = reponse?.volume_usd ? Number(reponse.volume_usd) : 0;
    }
    return {
      dailyVolume: volume,
      timestamp: dayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EOS]: {
      fetch: graph(CHAIN.EOS),
      start: "2025-04-15",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
