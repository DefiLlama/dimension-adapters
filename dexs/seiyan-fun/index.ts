import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const SEIYAN_FUN_BASE_URL = "https://seiyan.fun/api/public/v1";
const SEI_PACIFIC_CAIP_CHAIN_ID = "cosmos:sei-pacific-1";
const SEIYAN_FUN_INITIAL_TIMESTAMP = 1722470400; // 2024-08-01 00:00:00 UTC

const buildTradingVolumeUrl = (startAt: number, endAt: number) =>
  `${SEIYAN_FUN_BASE_URL}/trading-volume?caipChainID=${SEI_PACIFIC_CAIP_CHAIN_ID}&startAt=${startAt}&endAt=${endAt}`;

const fetch = async (options: FetchOptions) => {
  const dayStart = options.startOfDay;
  const nextDayStart = dayStart + 86400;
  const url = buildTradingVolumeUrl(dayStart, nextDayStart);
  const { volume }= await fetchURL(url);
  return {
    dailyVolume: volume,
  };
};

const adapter = {
  fetch,
  chains: [CHAIN.SEI],
  start: SEIYAN_FUN_INITIAL_TIMESTAMP,
  // seiyan.fun is NXDOMAIN, apex included, so there is no host left to query. Last published
  // point 2025-07-02, last non-zero 2025-06-30 ($8), and the protocol no longer reports TVL.
  deadFrom: '2025-07-03',
};

export default adapter;
