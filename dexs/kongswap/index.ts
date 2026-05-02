import { Adapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const response = await httpGet('https://api2.kongswap.io/pools/totals', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  return {
    dailyVolume: response.total_volume_24h,
    dailyFees: response.total_fees_24h,
  }
};

const adapter: Adapter = {
  deadFrom: '2026-04-06',
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2024-11-01',
    },
  }
}

export default adapter;
