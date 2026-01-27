import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";


const URL = sdk.graph.modifyEndpoint('4GX8RE9TzEWormbkayeGj4NQmmhYE46izVVUvXv8WPDh');
interface IPair {
  id: string;
  fee: string;
  volumeUSD: string;
}

interface IPairs {
  fee: number;
  volumeUSD: number;
}

interface IQueryRange {
  yesterday: IPair[];
  today: IPair[];
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const todaysBlock = (await getBlock(todaysTimestamp, 'ethereum', {}));
  const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, 'ethereum', {}));

  const graphQueryDaily = gql
  `query fees {
    yesterday: pairs(first: 500, orderBy: trackedReserveETH, orderDirection: desc, block: {number: ${yesterdaysBlock}}) {
      id
      fee
      volumeUSD
    }
    today: pairs(first: 500, orderBy: trackedReserveETH, orderDirection: desc,  block: {number: ${todaysBlock}}) {
      id
      fee
      volumeUSD
    }
  }`;
  const graphResDaily: IQueryRange = await request(URL, graphQueryDaily);
  const pairsAddress = [...new Set([...graphResDaily.yesterday.map((e: IPair) => e.id), ...graphResDaily.today.map((e: IPair) => e.id)])]
  const pairs: IPairs[] = pairsAddress.map((address: string) => {
    const yesterday =  graphResDaily.yesterday.find((se: IPair) => se.id === address);
    const today =  graphResDaily.today.find((se: IPair) => se.id === address);
    return {
      volumeUSD: (yesterday && today) ? Number(yesterday.volumeUSD) - Number(today.volumeUSD) : 0,
      fee: (yesterday && today) ? Number(yesterday.fee) : 0
    } as IPairs
  });

  const dailyFees = pairs
    .filter((e: IPairs) => e.volumeUSD)
    .reduce((a: number, b: IPairs) => a + ((Number(b.fee)/10**6) * Number(b.volumeUSD)), 0);

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,

  }
}
const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2022-12-31'
    },
  }
}

export default adapter;
