import { Adapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";
import { Chain } from '@defillama/sdk/build/general';
import customBackfill from "../../helpers/customBackfill";
const { request, gql } = require("graphql-request");

const info = {
  ethereum: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/ethereum-v1',
    startTimestamp: 1623168000,
  },
  bsc: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/bsc-v1',
    startTimestamp: 1623168000,
  },
  polygon: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/polygon-v1',
    startTimestamp: 1623168000,
  },
  arbitrum: {
    subgraph: 'https://api.thegraph.com/subgraphs/name/synfutures/arbitrum-one-v1',
    startTimestamp: 1623168000,
  },
}

interface DailyVolume {
  timestamp: number;
  quoteAddr: string;
  volume: number;
}

const QUERY_DAILY_VOLUME = gql`{
  query dailyVolumes(endDayId: Int!) {
    quoteDataDailySnapshots(first: 1000, where: {dayId_lte: $endDayId}) {
      id
      dayId
      quote{
        id
        symbol
      }
      dayTradeVolume
    }
  }`;

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    console.info('xxxx', chain, timestamp, dayTimestamp);
    // const data = await request(info[chain].subgraph, QUERY_DAILY_VOLUME, { endDayId: Math.floor(timestamp / 86400)});
    // console.info('data:', data);
    // const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(chains[chain])))?.data;
    // const totalVolume = historicalVolume
    //   .filter(volItem =>Number(volItem.timestamp)/1000 <= dayTimestamp)
    //   .reduce((acc, { dailyVolume }) => acc + Number(dailyVolume), 0)

    // const dailyVolume = historicalVolume
    //   .find(dayItem =>Number(dayItem.timestamp)/1000 === dayTimestamp)?.dailyVolume
    return {
      totalVolume: `12000`,
      dailyVolume: `200`,
      timestamp: dayTimestamp,
    };
  }
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(info).reduce((acc, chain: any) => {
    console.info(acc);
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain as Chain),
        // start: () => 1623168000,
        start: () => 1668873600,
        customBackfill: customBackfill(chain as Chain, fetch)
      }
    }
  }, {})
};

export default adapter;


