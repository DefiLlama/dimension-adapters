import { BreakdownAdapter, FetchOptions, FetchResultFees, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getBribes } from './bribes';
import { exportDexVolumeAndFees } from '../../helpers/dexVolumeLogs';
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const FACTORY_ADDRESS = '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367';
const FACTORY_V3_ADDRESS = '0x952aC46B2586737df679e836d9B980E43E12B2d8';
interface IPoolData {
  id: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.SCROLL]: "https://api.thegraph.com/subgraphs/name/bitdeep/keller-cl", 
}
const fetch = (chain: Chain) => {
  return async (timestamp: any): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp.fromTimestamp * 1000));
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
    const graphQuery = gql
      `
      {
        uniswapDayData(id: ${dateId}) {
          id
          feesUSD
        }
      }
    `;

    const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).uniswapDayData;
    const dailyFeeUSD = graphRes;
    const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
    if (dailyFee === undefined) return { timestamp }

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.times(0.2).toString(),
      dailyHoldersRevenue: dailyFee.times(0.2).toString(),
    };
  };
}

const getFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const v1Results = await exportDexVolumeAndFees({ chain: CHAIN.SCROLL, factory: FACTORY_ADDRESS })(options.endTimestamp, {}, options)
  const bribesResult = await getBribes(options);
  v1Results.dailyBribesRevenue = bribesResult.dailyBribesRevenue;
  return {
    dailyFees: v1Results.dailyFees,
    dailyRevenue: v1Results.dailyRevenue,
    dailyHoldersRevenue: v1Results.dailyFees,
    dailyBribesRevenue: v1Results.dailyBribesRevenue,
  }
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
  v2: {
    [CHAIN.SCROLL]: {
      fetch: getFees,
      start: 1710806400
    },
  },
  v3:{
    [CHAIN.SCROLL]: {
      fetch: fetch(CHAIN.SCROLL),
      start: 1712174400,
    },
  }
},
};
export default adapter;


