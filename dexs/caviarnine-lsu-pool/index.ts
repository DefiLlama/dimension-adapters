import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"

interface CaviarNineLSUPool {
  protocol_fees: {
    interval_1d: {
      usd: number;
    }
  }
  lp_revenue: {
    interval_1d: {
      usd: number;
    }
  };
  volume: {
    interval_1d: {
      usd: number;
    }
  };
}
const fetchFees = async (timestamp: number): Promise<FetchResultVolume> => {
  const response: CaviarNineLSUPool = (await fetchURL("https://api-core.caviarnine.com/v1.0/stats/product/lsupool")).summary;
  const dailyVolume = Number(response.volume.interval_1d.usd);
  return {
    dailyVolume: dailyVolume,
    timestamp
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch: fetchFees,
      start: '2023-11-05',
      // runAtCurrTime: true
    }
  }
}
export default adapters;
