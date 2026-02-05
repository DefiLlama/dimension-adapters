import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDay } from "../../utils/date";

interface IDayDataGraph {
  id: string;
  rewardsUsdc: string;
  lossesUsdc: string;
}
interface ITotalDataGraph {
  id: string;
  totalRewardsUsdc: string;
  totalLossesUsdc: string;
  timestamp: string;
}

const URL = sdk.graph.modifyEndpoint('5m8N5qAkDWTf2hhMFhJJJDsWWF5b9J7bzFbXwPnZHJQQ');

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDay(timestamp);
  const chain = CHAIN.ARBITRUM;
  const balances = new sdk.Balances({ chain });
  const balances1 = new sdk.Balances({ chain });
  const dayDataQuery = gql`
    {
			dayData(id: ${dayTimestamp * 1000}) {
				id
        rewardsUsdc
        lossesUsdc
			}
		}`;

  const totalDataQuery = gql`
    {
    totalDatas {
      id
      totalRewardsUsdc
      totalLossesUsdc
      timestamp
    }
  }`

  const dayDataResponse: IDayDataGraph = (await request(URL, dayDataQuery)).dayData;
  const totalDataResponse: ITotalDataGraph[] = (await request(URL, totalDataQuery)).totalDatas;

  let perDayIncome = 0;
  let totalIncome = 0;

  if (dayDataResponse) {
    perDayIncome = Math.abs(Number(dayDataResponse.rewardsUsdc) - Number(dayDataResponse.lossesUsdc));
  }

  if (totalDataResponse.length > 0) {
    totalIncome = Math.abs(Number(totalDataResponse[0].totalRewardsUsdc) - Number(totalDataResponse[0].totalLossesUsdc));
  }

  balances.add(ADDRESSES[chain].USDC_CIRCLE, perDayIncome);
  balances1.add(ADDRESSES[chain].USDC_CIRCLE, totalIncome);


  return {
    dailyFees: await balances.getUSDString(),
    totalFees: await balances1.getUSDString(),
    timestamp: dayTimestamp,
  };
};

const methodology = {
  Fees: "Trade collateral collected.",
  Revenue: "Platform profit, (trader losses minus trader wins).",
};

const adapters: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
    },
  },
};
export default adapters;
