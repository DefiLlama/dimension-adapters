import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { FetchOptions } from "../adapters/types";

const LYNX = '0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af';
const bveLYNX = '0xe8a4c9b6a2b79fd844c9e3adbc8dc841eece557b';
interface IPoolData {
    id: number;
    feesUSD: string;
}

type IURL = {
    [l: string | Chain]: string;
}

const endpoints: IURL = {
    [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/59052/lynex-cl/v1.0.1"
}

const event_reward_added = 'event RewardAdded(address indexed rewardToken,uint256 reward,uint256 startTimestamp)';
const event_gauge_created = 'event GaugeCreated(address indexed gauge, address creator,address internal_bribe,address indexed external_bribe,address indexed pool)'

export const fees_bribes = async ({ getLogs, createBalances, getToBlock }: FetchOptions): Promise<sdk.Balances> => {
  const voter = '0x0B2c83B6e39E32f694a86633B4d1Fe69d13b63c5';
  const dailyFees = createBalances()
  const logs_geuge_created = (await getLogs({
    target: voter,
    fromBlock: 2207763,
    toBlock: await getToBlock(),
    eventAbi: event_gauge_created,
    cacheInCloud: true,
  }))
  const bribes_contract: string[] = logs_geuge_created.map((e: any) => e.external_bribe.toLowerCase());

  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_reward_added,
  })
  logs.map((e: any) => {
    // NOTE: bveLYNX is a derivative token 1:1 to LYNX and should be counted as LYNX as it is not tracked in coingecko
    if (e.rewardToken.toLowerCase() === bveLYNX)
        dailyFees.add(LYNX, e.reward)
    else
        dailyFees.add(e.rewardToken, e.reward)
  })
  return dailyFees;
}


const fetch = async (fetchOptions: FetchOptions): Promise<FetchResultFees> => {
        const chain = fetchOptions.chain;
        const timestamp = fetchOptions.startOfDay;
        const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
        const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
        const graphQuery = gql
            `
                {
                    algebraDayData(id: ${dateId}) {
                    id
                    feesUSD
                    }
                }
            `;

        const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).algebraDayData;
        const dailyFeeUSD = graphRes;
        const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
        const dailyBribesRevenue = await fees_bribes(fetchOptions)
        if (dailyFee === undefined) return { timestamp }

        return {
            timestamp,
            dailyFees: dailyFee.toString(),
            dailyUserFees: dailyFee.toString(),
            dailyRevenue: dailyFee.toString(),
            dailyHoldersRevenue: dailyFee.toString(),
            dailyBribesRevenue
        };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.LINEA]: {
            fetch: fetch,
            start: '2023-08-07',
        },
    },
};

export default adapter;
