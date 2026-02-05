import { SimpleAdapter, FetchV2 } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

interface IBsxStatsResponse {
  volume_24h: string;
  volume_total: string;
}

const fetchBsxVolumeData: FetchV2 = async ({ endTimestamp }) => {
  const url = "https://api.bsx.exchange/defillama-stats?end_time=" + endTimestamp * 1e9;
  const data: IBsxStatsResponse = await fetchURL(url);
  const dailyVolume = Number(data.volume_24h).toFixed(2);
  const totalVolume = Number(data.volume_total).toFixed(2);

  return {
    timestamp: endTimestamp,
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBsxVolumeData,
      start: '2024-04-01',
    },
  },
};

export default adapter;
