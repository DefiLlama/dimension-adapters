import request, { gql } from "graphql-request";
import { Chain } from "../../adapters/types";
import type { ChainEndpoints } from "../../adapters/types";
import {
  IValoremDailyRecordsResponse,
  IValoremDailyTokenRecordsResponse,
  IValoremDayData,
  IValoremTokenDayData,
} from "./interfaces";
import BigNumber from "bignumber.js";

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

export const tokensQuery = gql`
  query {
    tokens(first: 1000) {
      id
      decimals
    }
  }
`;

export const tokenDayDataQuery = gql`
  query ($tokenId: String, $skipNum: Int, $timestamp: Int) {
    tokenDayDatas(
      first: 1000
      skip: $skipNum
      orderBy: date
      orderDirection: asc
      where: { date_lte: $timestamp, token_: { id: $tokenId } }
    ) {
      date
      token {
        symbol
      }
      notionalVolWritten
      notionalVolTransferred
      notionalVolSettled
      notionalVolRedeemed
      notionalVolExercised
      notionalVolCoreSum
      volFeesAccrued
      volFeesSwept
    }
  }
`;

export type DailyTokenRecords = { [key: string]: IValoremTokenDayData[] };

export const getAllDailyTokenRecords = async (
  graphUrls: ChainEndpoints,
  chain: Chain,
  timestamp: number
): Promise<DailyTokenRecords> => {
  const { tokens }: { tokens: { id: string; decimals: number }[] } =
    await request(graphUrls[chain], tokensQuery);

  let allDailyTokenRecords: DailyTokenRecords = {};

  const promises = tokens.map(async (token) => {
    const key = `${chain}:${token.id}`;

    allDailyTokenRecords[key] = [];

    let moreRemaining = true;
    let i = 0;

    // should really never have to loop more than once, at least for a few more years
    while (moreRemaining) {
      const { tokenDayDatas }: IValoremDailyTokenRecordsResponse =
        await request(graphUrls[chain], tokenDayDataQuery, {
          tokenId: token.id,
          skipNum: i * 1000,
          timestamp: timestamp,
        });

      const parsed = tokenDayDatas.map((tokenDayData) => {
        let parsedValue = Object.keys(tokenDayData).reduce(
          (acc, key) => {
            if (key === "token" || key === "date") {
              return acc;
            }
            try {
              const asBigInt = new BigNumber(
                tokenDayData[
                  key as keyof Omit<IValoremTokenDayData, "date" | "token">
                ]
              ).times(new BigNumber(10 ** -token.decimals));

              acc[key] = asBigInt.toString();
            } catch (error) {}
            return acc;
          },
          {
            date: tokenDayData.date,
            token: { symbol: tokenDayData.token.symbol },
          } as Record<any, any>
        );

        return parsedValue as unknown as IValoremTokenDayData;
      });

      allDailyTokenRecords[key] = parsed;

      if (tokenDayDatas.length < 1000) {
        moreRemaining = false;
      }

      i++;
    }
  });

  await Promise.all(promises);

  return allDailyTokenRecords;
};
