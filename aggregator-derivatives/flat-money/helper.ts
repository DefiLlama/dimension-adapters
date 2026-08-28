import {CHAIN} from "../../helpers/chains";
import {gql, GraphQLClient} from "graphql-request";

export const CONFIG = {
  [CHAIN.BASE]: {
    startTimestamp: 1721161357,
    endpoint: "https://gateway-arbitrum.network.thegraph.com/api/c26ffec48be89fe71a1af11eb1ae5776/subgraphs/id/HnQeWxwtLY5ZnBS39GmYt84gcHToG7cqjb8KVPApm89h",
    decimals: {
      price: 18,
      amount: 18,
    }
  },
  [CHAIN.OPTIMISM]: {
    startTimestamp: 1744830648,
    endpoint: "https://gateway-arbitrum.network.thegraph.com/api/c26ffec48be89fe71a1af11eb1ae5776/subgraphs/id/C5B1KnswowpwwVGNCVw8Ph7X4rqEuyoZZN7UWjjckEtm",
    decimals: {
      price: 18,
      amount: 8,
    }
  },
  [CHAIN.ARBITRUM]: {
    startTimestamp: 1744830648,
    endpoint: "https://gateway-arbitrum.network.thegraph.com/api/c26ffec48be89fe71a1af11eb1ae5776/subgraphs/id/4Ttk2WinVSCURA9vVZ5tDz7TwG7tEDkQbFbGur5qxoWG",
    decimals: {
      price: 18,
      amount: 8,
    }
  },
};

export const fetchVolume = async (chainId: CHAIN, query: string, volumeField: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint } = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        startTimestamp,
        endTimestamp,
        first: batchSize,
        skip
      });

      const entries = data[volumeField];
      if (entries.length === 0) break;
      allData = allData.concat(entries);
      skip += batchSize;

      if (entries.length < batchSize) break;

      await sleep(500);
    } catch (e) {
      throw new Error(`Error fetching data for chain ${chainId}: ${e.message}`);
    }
  }
  return allData;
};

export const calculateOpensVolume = (data: any, amountDecimals: number): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.entryPrice) / 1e18;
    const marginFormatted = Number(item.margin) / 10 ** amountDecimals;
    const sizeFormatted = Number(item.size) / 10 ** amountDecimals;
    return acc + (marginFormatted + sizeFormatted) * priceFormatted;
  }, 0);

export const calculateAdjustsVolume = (data: any, amountDecimals: number): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.adjustPrice) / 1e18;
    const marginDeltaFormatted = Number(Math.abs(item.marginDelta)) / 10 ** amountDecimals;
    const sizeDeltaFormatted = Number(Math.abs(item.sizeDelta)) / 10 ** amountDecimals;
    return acc + (marginDeltaFormatted + sizeDeltaFormatted) * priceFormatted;
  }, 0);

export const calculateClosesVolume = (data: any, amountDecimals: number): number =>
  data.reduce((acc: number, item: any) => {
    const priceFormatted = Number(item.closePrice) / 1e18;
    const settledMarginFormatted = Number(item.settledMargin) / 10 ** amountDecimals;
    const sizeFormatted = Number(item.size) / 10 ** amountDecimals;
    return acc + (settledMarginFormatted + sizeFormatted) * priceFormatted;
  }, 0);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const leverageOpensQuery = gql`
    query leverageOpens($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        leverageOpens(
            where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
            first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) {
            margin,
            size,
            entryPrice
        }
    }`;

export const leverageAdjustsQuery = gql`
    query leverageAdjusts($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        leverageAdjusts(
            where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
            first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) {
            marginDelta,
            sizeDelta,
            adjustPrice
        }
    }`;

export const leverageClosesQuery = gql`
    query leverageCloses($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
        leverageCloses(
            where: { blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
            first: 1000, orderBy: blockTimestamp, orderDirection: asc
        ) {
            settledMargin,
            size,
            closePrice
        }
    }`;