import { Adapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async () => {
  const response = await fetchURL('https://api.kongswap.io/api/pools/totals');
  return {
    dailyVolume: response.total_volume_24h,
    dailyFees: response.total_fees_24h,
  }
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2024-11-01',
    },
  }
}

export default adapter;
