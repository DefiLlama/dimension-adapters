import request, { gql } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import type { ChainEndpoints } from "../../adapters/types";
import { IValoremDailyRecordsResponse, IValoremDayData } from "./interfaces";

export const dayDataQuery = gql`
  query ($skipNum: Int) {
    dayDatas(first: 1000, skip: $skipNum, orderBy: date, orderDirection: asc) {
      date
      notionalVolWrittenUSD
      notionalVolExercisedUSD
      notionalVolRedeemedUSD
      notionalVolTransferredUSD
      notionalVolSettledUSD
      notionalVolSumUSD
      notionalVolFeesAccruedUSD
      notionalVolFeesSweptUSD
    }
  }
`;

export const getAllDailyRecords = async (
  graphUrls: ChainEndpoints,
  chain: Chain
): Promise<IValoremDayData[]> => {
  const allDailyRecords: IValoremDayData[] = [];

  let moreRemaining = true;
  let i = 0;
  while (moreRemaining) {
    const { dayDatas }: IValoremDailyRecordsResponse = await request(
      graphUrls[chain],
      dayDataQuery,
      {
        skipNum: i * 1000,
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
