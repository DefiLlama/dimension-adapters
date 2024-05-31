import { FetchOptions, FetchResult, FetchV2, } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";
import customBackfill from "../../helpers/customBackfill";
import { ChainApi, api2 } from "@defillama/sdk";

const chainsMap: Record<string, string> = {
  BNB: "bsc",
  //comming soon
  // ETHEREUM: "ethereum",
  // POLYGON: "polygon",
  // BASE: "base",
};
function convertTimestampToUTCString(timestamp) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds} UTC`;

  return formattedDate;
}

const fetch =
  (chain: string) =>
    async (opt:FetchOptions): Promise<FetchResult> => {
      const utcString=convertTimestampToUTCString(opt.startOfDay*1000)//like 2024-05-31 00:00:00.000 UTC
      const data = await fetchURLWithRetry(`https://api.dune.com/api/v1/query/3781797/results`)
      const chainData = data.result.rows.find(
        (row: any) => row.block_date === utcString
      );
      return {
        dailyVolume: chainData.bscVolumeUSD,
        dailyUserFees:chainData.feesUSD,
        timestamp:opt.endTimestamp,
      }
    };

const adapter: any = {
  timetravel: false,
  version: 2,
  adapter: {
    ...Object.values(chainsMap).reduce((acc, chain) => {
      return {
        ...acc,
        [(chainsMap as any)[chain] || chain]: {
          fetch: fetch(chain),
          runAtCurrTime: false,
          start: 1703376000,
          customBackfill: customBackfill(chain, () => fetch(chain))

        },
      };
    }, {}),
  },
  isExpensiveAdapter: true,
};

export default adapter;
