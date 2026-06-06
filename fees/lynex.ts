import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import BigNumber from "bignumber.js";
import request from "graphql-request";
import { Adapter, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

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
            dailyFees.add(LYNX, e.reward, 'Bribes from external protocols')
        else
            dailyFees.add(e.rewardToken, e.reward, 'Bribes from external protocols')
    })
    return dailyFees;
}


const fetch: any = async (options: FetchOptions) => {
    const chain = options.chain;
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400)
    const graphQuery = 
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
    const dailyBribesRevenue = await fees_bribes(options)
    if (dailyFee === undefined) throw new Error("Failed to fetch daily fees for Lynex")

    return {
        dailyFees: dailyFee.toString(),
        dailyUserFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
        dailyHoldersRevenue: dailyFee.toString(),
        dailyBribesRevenue
    };
}

const methodology = {
    Fees: "Swap fees paid by traders on the Lynex DEX",
    Revenue: "All swap fees are distributed to governance token holders",
    HoldersRevenue: "Swap fees distributed to LYNX token holders plus bribes paid by external protocols to voters"
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Fees paid by users on token swaps through the Lynex DEX"
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "All swap fees are distributed to LYNX governance token holders"
    },
    HoldersRevenue: {
        [METRIC.SWAP_FEES]: "Swap fees distributed to LYNX token holders",
        'Bribes from external protocols': "Incentive tokens paid by external protocols to LYNX voters to direct liquidity gauge emissions"
    }
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.LINEA]: {
            fetch,
            start: '2023-08-07',
        },
    },
    methodology,
    breakdownMethodology,
};

export default adapter;
