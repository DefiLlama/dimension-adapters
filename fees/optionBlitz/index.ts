import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import * as sdk from "@defillama/sdk";

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

const URL = "https://api.thegraph.com/subgraphs/name/web3dev00/optionblitz";

const fetch = async (): Promise<FetchResult> => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const dayTimestamp = date.getTime();
  const chain = CHAIN.ARBITRUM;
  const balances = new sdk.Balances({ chain });
  const balances1 = new sdk.Balances({ chain });
  const dayDataQuery = gql`
    {
			dayData(id: ${dayTimestamp}) {
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

  let perDayIncome = BigInt(0);
  let totalIncome = BigInt(0);

  if (dayDataResponse) {
    perDayIncome = BigInt(dayDataResponse.rewardsUsdc) - BigInt(dayDataResponse.lossesUsdc);
  }

  if (totalDataResponse.length > 0) {
    totalIncome = BigInt(totalDataResponse[0].totalRewardsUsdc) - BigInt(totalDataResponse[0].totalLossesUsdc);
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
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: 194784191,
      meta: {
        methodology: methodology,
      },
    },
  },
};
export default adapters;
