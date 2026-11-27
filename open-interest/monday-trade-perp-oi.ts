import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

// daily series behind https://stats.monday.trade
const oiUrl = "https://files.monday.trade/monday-analytics-prod/latest/perp-open-interest.json"

const fetch = async (options: FetchOptions) => {
  const { data } = await fetchURL(oiUrl)
  const oiDay = data.find((i: any) => i.date === `${options.dateString}T00:00:00Z`)
  if (!oiDay) throw new Error(`stats.monday.trade has no perp open interest for ${options.dateString}`)

  return { openInterestAtEnd: Number(oiDay.oiNotionalUsd) };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2026-02-05',
  deadFrom: '2026-05-09', // perps shut down: no instrument trade events after 2026-05-08, only Gate withdrawals since
};

export default adapter;
