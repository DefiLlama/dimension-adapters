import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPairDayData {
  id: string;
  dailyVolumeUSD: string;
}

interface IPair {
  id: string;
  isStable: boolean;
}

type IURL = {
  [l: string | Chain]: string;
};

const STABLE_FEE = 0.0001;
const VOLATILE_FEE = 0.0025;

const endpoints: IURL = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/59052/lynex-v1/version/latest",
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    console.log("Starting fetch for timestamp:", timestamp);
    const todayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const dateId = Math.floor(
      getTimestampAtStartOfDayUTC(todayTimestamp) / 86400
    ).toString();

    console.log("Calculated dateId:", dateId);

    const pairsQuery = gql`
      query getPairs {
        pairs(first: 500, orderBy: trackedReserveETH, orderDirection: desc) {
          id
          isStable
        }
      }
    `;

    const pairDayDataQuery = gql`
      query getPairDayData($id: String!) {
        pairDayData(id: $id) {
          dailyVolumeUSD
          id
        }
      }
    `;

    let pairsResult;
    try {
      pairsResult = await request(endpoints[chain], pairsQuery);
      console.log("Pairs result:", pairsResult);
    } catch (error) {
      console.error("Error fetching pairs:", error);
      return { timestamp };
    }

    const pairs: IPair[] = pairsResult.pairs;
    let totalFeesUSD = new BigNumber(0);

    for (const pair of pairs) {
      try {
        const pairDayDataResult = await request(
          endpoints[chain],
          pairDayDataQuery,
          { id: `${pair.id}-${dateId}` }
        );
        const pairDayData: IPairDayData = pairDayDataResult.pairDayData;

        if (pairDayData) {
          const volumeUSD = new BigNumber(pairDayData.dailyVolumeUSD);
          const feeRate = pair.isStable ? STABLE_FEE : VOLATILE_FEE;
          const dailyFeesUSD = volumeUSD.multipliedBy(feeRate);

          totalFeesUSD = totalFeesUSD.plus(dailyFeesUSD);
        } else {
          console.log(`No data for pair: ${pair.id} on date: ${dateId}`);
        }
      } catch (error) {
        console.error(`Error fetching pairDayData for pair ${pair.id}:`, error);
      }
    }

    if (totalFeesUSD.isZero()) return { timestamp };

    return {
      timestamp,
      dailyFees: totalFeesUSD.toString(),
      dailyUserFees: totalFeesUSD.toString(),
      dailyRevenue: totalFeesUSD.toString(),
      dailyHoldersRevenue: totalFeesUSD.toString(),
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch: fetch(CHAIN.LINEA),
      start: 1691394680,
    },
  },
};

export default adapter;
