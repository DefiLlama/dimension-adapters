import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
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
  [CHAIN.BSC]: {
    subgraph:
      sdk.graph.modifyEndpoint('DdLtKxzUi6ExMok8dNWh9B2HN5WeTWcQsfSSZMKH1trQ'),
  },
};


const fetch = async (options: FetchOptions) => {
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
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BSC],
  start: '2023-07-19',
};

export default adapter;
