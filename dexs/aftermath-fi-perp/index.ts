import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const CCXT_MARKETS_URL = "https://aftermath.finance/api/ccxt/markets";
const MARKETS_24HR_STATS_URL = "https://aftermath.finance/api/perpetuals/markets/24hr-stats";
const MARKETS_URL = "https://aftermath.finance/api/perpetuals/markets";

const fetch = async () => {
  const markets: any[] = await httpGet(CCXT_MARKETS_URL);
  const marketIds = markets.map((m: any) => m.id);

  const [statsRes, marketsRes] = await Promise.all([
    httpPost(MARKETS_24HR_STATS_URL, { marketIds }),
    httpPost(MARKETS_URL, { marketIds }),
  ]);

  const dailyVolume = statsRes.marketsStats.reduce(
    (acc: number, s: any) => acc + (s.volumeUsd || 0),
    0
  );

  const openInterestAtEnd = marketsRes.marketDatas.reduce(
    (acc: number, m: any) => acc + (m.market.marketState.openInterest * m.market.indexPrice),
    0
  );

  return { dailyVolume, openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-02-18",
    },
  },
};

export default adapter;
