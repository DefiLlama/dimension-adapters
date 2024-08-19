import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfNextDayUTC,
} from "../../utils/date";

const SEIYAN_FUN_BASE_URL = "https://seiyan.fun/api/public/v1";
const SEI_PACIFIC_CAIP_CHAIN_ID = "cosmos:sei-pacific-1";
const SEIYAN_FUN_INITIAL_TIMESTAMP = 1722470400; // 2024-08-01 00:00:00 UTC

const buildTradingVolumeUrl = (startAt: number, endAt: number) =>
  `${SEIYAN_FUN_BASE_URL}/trading-volume?caipChainID=${SEI_PACIFIC_CAIP_CHAIN_ID}&startAt=${startAt}&endAt=${endAt}`;

const fetch = async (timestamp: number) => {
  const dayStart = getTimestampAtStartOfDayUTC(timestamp);
  const nextDayStart = getTimestampAtStartOfNextDayUTC(timestamp);
  const url = buildTradingVolumeUrl(dayStart, nextDayStart);

  const { volume } = await fetchURL(url);

  return {
    dailyVolume: volume,
    timestamp,
  };
};

const adapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: SEIYAN_FUN_INITIAL_TIMESTAMP,
    },
  },
};

export default adapter;
