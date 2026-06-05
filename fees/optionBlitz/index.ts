import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDay } from "../../utils/date";

interface IDayDataGraph {
  id: string;
  rewardsUsdc: string;
  lossesUsdc: string;
}


const URL = sdk.graph.modifyEndpoint('5m8N5qAkDWTf2hhMFhJJJDsWWF5b9J7bzFbXwPnZHJQQ');

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDay(options.toTimestamp);
  const chain = CHAIN.ARBITRUM;
  const balances = new sdk.Balances({ chain });
  const dayDataQuery = gql`
    {
			dayData(id: ${dayTimestamp * 1000}) {
				id
        rewardsUsdc
        lossesUsdc
			}
		}`;


  const dayDataResponse: IDayDataGraph = (await request(URL, dayDataQuery)).dayData;

  let perDayIncome = 0;
  let totalIncome = 0;

  if (dayDataResponse) {
    perDayIncome = Math.abs(Number(dayDataResponse.rewardsUsdc) - Number(dayDataResponse.lossesUsdc));
  }

  balances.add(ADDRESSES[chain].USDC_CIRCLE, perDayIncome);


  return {
    dailyFees: await balances.getUSDString(),
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
  fetch,
  chains: [CHAIN.ARBITRUM],
  deadFrom: '2024-07-12',
};

export default adapters;
