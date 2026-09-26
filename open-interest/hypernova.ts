import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const MARKETS_URL = "https://app.hypernova.xyz/api/hypernova.services.analytics.v1.AnalyticsService/GetPublicMarkets?connect=v1&encoding=json&message=%7B%7D";

const LABELS = {
  fundedAccountsOpenInterest: "Funded Accounts Open Interest",
};

type MarketsResponse = { partial?: unknown; stale?: unknown; overview?: { platformOpenInterestUsd?: unknown } };

const fetch = async (options: FetchOptions) => {
  const data: MarketsResponse = await httpGet(MARKETS_URL, { timeout: 30_000 });
  if (data.partial !== false || data.stale !== false) throw new Error(`Hypernova GetPublicMarkets: partial=${data.partial} stale=${data.stale}`);
  const openInterest = data.overview?.platformOpenInterestUsd;
  if (typeof openInterest !== "string" || !/^\d+(?:\.\d+)?$/.test(openInterest)) throw new Error(`Hypernova GetPublicMarkets: invalid platformOpenInterestUsd ${JSON.stringify(openInterest)}`);

  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addUSDValue(Number(openInterest), LABELS.fundedAccountsOpenInterest);
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  runAtCurrTime: true,
  pullHourly: false,
  methodology: {
    OpenInterest: "Open long and short positions on funded accounts, at current prices.",
  },
  breakdownMethodology: {
    OpenInterest: {
      [LABELS.fundedAccountsOpenInterest]: "Total USD size of open long and short positions on funded accounts.",
    },
  },
};

export default adapter;
