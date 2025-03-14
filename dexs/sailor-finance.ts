import { CHAIN } from '../helpers/chains';
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphFees';
import { httpGet } from '../utils/fetchURL';


const endpoint = "https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getVolumeAndTvl";

async function fetch() {
  const timestamp = getUniqStartOfTodayTimestamp()
  let { data: { volume24 } } = await httpGet(endpoint);
  return {
    dailyVolume: volume24,
    timestamp,
  };
}

export default {
  version: 1,
  adapter: {
    [CHAIN.SEI]: {
      fetch: fetch,
      runAtCurrTime: true,
    }
  }
}
