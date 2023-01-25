import request, { gql } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import type { ChainEndpoints } from "../../adapters/types";
import { IValoremDailyRecordsResponse, IValoremDayData } from "./interfaces";

export const dayDataQuery = gql`
  query ($skipNum: Int, $timestamp: Int) {
    dayDatas(
      first: 1000
      skip: $skipNum
      orderBy: date
      orderDirection: asc
      where: { date_lte: $timestamp }
    ) {
      date
      notionalVolWrittenUSD
      notionalVolExercisedUSD
      notionalVolRedeemedUSD
      notionalVolTransferredUSD
      notionalVolSettledUSD
      notionalVolCoreSumUSD
      volFeesAccruedUSD
      volFeesSweptUSD
    }
  }
`;

export const getAllDailyRecords = async (
  graphUrls: ChainEndpoints,
  chain: Chain,
  timestamp: number
): Promise<IValoremDayData[]> => {
  const allDailyRecords: IValoremDayData[] = [];

  let moreRemaining = true;
  let i = 0;
  // should really never have to loop more than once, at least for a few more years
  while (moreRemaining) {
    const { dayDatas }: IValoremDailyRecordsResponse = await request(
      graphUrls[chain],
      dayDataQuery,
      {
        skipNum: i * 1000,
        timestamp: timestamp,
      }
    );

    allDailyRecords.push(...dayDatas);

    if (dayDatas.length < 1000) {
      moreRemaining = false;
    }

    i++;
  }

  return allDailyRecords;
};
