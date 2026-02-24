import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { BigNumberish, ethers } from "ethers";

const { request } = require("graphql-request");

const formatAmount = (
  amount: BigNumberish | string,
  decimals: number,
  mantissa: number = 2,
  thousandSeparated: boolean = true,
  trimMantissa: boolean = true
) => {
  let formattedAmount = parseFloat(ethers.formatUnits(amount, decimals));

  formattedAmount =
    Math.round(formattedAmount * Math.pow(10, mantissa)) /
    Math.pow(10, mantissa);

  let amountStr = formattedAmount.toString();

  if (!thousandSeparated) {
    amountStr = amountStr.replace(/,/g, "");
  }

  if (trimMantissa && amountStr.includes(".")) {
    let [wholePart, decimalPart] = amountStr.split(".");
    decimalPart = decimalPart.slice(0, mantissa);
    amountStr = `${wholePart}.${decimalPart}`;
  }

  return amountStr;
};
const info: { [key: string]: any } = {
  bsc: {
    subgraph:
      sdk.graph.modifyEndpoint('DdLtKxzUi6ExMok8dNWh9B2HN5WeTWcQsfSSZMKH1trQ'),
  },
};

function getUniqStartOfTodayTimestamp(now: Date) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const startOfDay = new Date(Date.UTC(year, month, day));
  return startOfDay.getTime() / 1000;
}

const fetchVolume = () => {
  return async (timestamp: number) => {
    const totdayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );

    const graphQLTotal = `
      {
        volumeStats(
          orderBy: "id"
          orderDirection: desc
          first: 1
          where: { period: total }
        ) {
          margin
          liquidation
        }
      }
    `;

    const graphQlDaily = `
      {
        volumeStats(
          orderBy: "id"
          orderDirection: desc
          first: 1
          where: { period: daily }
        ) {
          id
          margin
          liquidation
        }
      }
    `;

    // Fetch daily volume data
    const dataDaily = await request(info.bsc.subgraph, graphQlDaily);

    // Process the fetched data and compute the response

    const dailyVolume = formatAmount(
      dataDaily.volumeStats[0]?.margin || 0,
      30,
      0,
      true
    );

    return {
      dailyVolume: dailyVolume,
      timestamp: totdayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume(),
      start: '2023-07-19',
    },
  },
};

export default adapter;
