import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPoolData {
    id: number;
    feesUSD: string;
}

type IURL = {
    [l: string | Chain]: string;
}

const endpoints: IURL = {
    [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/cryptoalgebra/analytics"
}

const fetch = (chain: Chain) => {
    return async (timestamp: number): Promise<FetchResultFees> => {
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
        if (dailyFee === undefined) return { timestamp }

        return {
            timestamp,
            dailyFees: dailyFee.toString(),
            dailyUserFees: dailyFee.toString(),
            dailyRevenue: dailyFee.toString(),
            dailyHoldersRevenue: dailyFee.toString(),
        };
    };
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.LINEA]: {
            fetch: fetch(CHAIN.LINEA),
            start: 1691394680,
        },
    },
};

export default adapter;
