import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const historical = "https://moonswap.fi/api/route/opt/swap/dashboard/global-chart";
const START_TIME = 1634515198;
const PAGE_SIZE = 1000;

interface IDayData {
  date: number;
  dailyVolumeUSD: string;
}

const fetch = async (options: FetchOptions) => {
  const dayDatas: IDayData[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page: IDayData[] = (await httpPost(historical, { start_time: START_TIME, skip }))?.data?.uniswapDayDatas;
    if (!Array.isArray(page)) throw new Error(`moon-swap: unexpected response at skip ${skip}`);
    dayDatas.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  // the row labelled D holds the swaps of UTC day D-1
  const day = dayDatas.find(d => Number(d.date) === options.startOfDay + 86400);
  if (!day) throw new Error(`moon-swap: no data for ${options.dateString}`);
  // zero rows are indexer gaps, the pools traded on those days
  if (!(Number(day.dailyVolumeUSD) > 0)) throw new Error(`moon-swap: zero volume for ${options.dateString}`);

  return {
    dailyVolume: day.dailyVolumeUSD,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.CONFLUX],
  start: '2021-10-18',
  methodology: {
    Volume: "Daily swap volume in USD from the MoonSwap dashboard API.",
  },
  deadFrom: '2026-09-11'
};

export default adapter;
