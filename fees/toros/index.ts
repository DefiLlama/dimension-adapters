import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
const query = `
      query managerFeeMinteds($startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { managerFee, tokenPriceAtLastFeeMint }
      }`

// if graph goes down, can be pulled via event logs, example:
// https://optimistic.etherscan.io/tx/0x265e1eeb9a2c68ef8f58fe5e1d7e3f1151dd5e6686d4147445bf1bd8895deb38#eventlog check topic: 0x755a8059d66d8d243bc9f6913f429a811f154599d0538bb0b6a2ac23f23d2ccd
/* const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  let torosManagerAddress = CONFIG[chain].torosManagerAddress.toLowerCase();
  const dailyFees = createBalances();
  const logs = await getLogs({
    eventAbi: 'event ManagerFeeMinted (address pool, address manager, uint256 available, uint256 daoFee, uint256 managerFee, uint256 tokenPriceAtLastFeeMint)',
  });
  logs.forEach(i => {
    if (i.manager.toLowerCase() !== torosManagerAddress) return;
    dailyFees.addUSDValue(i.daoFee.toString() * i.tokenPriceAtLastFeeMint.toString() / 1e36)
  });

  return { dailyFees, dailyRevenue: dailyFees };
} */
const CONFIG = {
  [CHAIN.OPTIMISM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-optimism/version/latest",
    torosManagerAddress: "0x813123a13d01d3f07d434673fdc89cbba523f14d",
  },
  [CHAIN.POLYGON]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-polygon/version/latest",
    torosManagerAddress: "0x090e7fbd87a673ee3d0b6ccacf0e1d94fb90da59",
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-arbitrum/version/latest",
    torosManagerAddress: "0xfbd2b4216f422dc1eee1cff4fb64b726f099def5",
  },
  [CHAIN.BASE]: {
    startTimestamp: 1712227101,
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-base-mainnet/version/latest",
    torosManagerAddress: "0x5619ad05b0253a7e647bd2e4c01c7f40ceab0879",
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, managerAddress: string, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, } = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        manager: managerAddress,
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
        first: batchSize,
        skip
      });

      const entries = data.managerFeeMinteds
      if (entries.length === 0) break;

      allData = allData.concat(entries);
      skip += batchSize;

      if (entries.length < batchSize) break;

    } catch (e) {
      throw new Error(`Error fetching data for chain ${chainId}: ${e.message}`);
    }
  }
  return allData;
};

const calculateFees = (data: any): number =>
  data.reduce((acc: number, item: any) => {
    const managerFee = Number(item.managerFee);
    const tokenPrice = Number(item.tokenPriceAtLastFeeMint);
    const managerFeeFormatted = managerFee / 1e18;
    const tokenPriceFormatted = tokenPrice / 1e18;
    const managerFeeUsd = managerFeeFormatted * tokenPriceFormatted;
    return acc + managerFeeUsd;
  }, 0);

const fetch = async ({ chain, endTimestamp, startTimestamp }: FetchOptions) => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyFees = await fetchHistoricalFees(chain as CHAIN, config.torosManagerAddress, startTimestamp, endTimestamp)

  return {
    dailyFees: calculateFees(dailyFees),
    dailyRevenue: calculateFees(dailyFees),
    timestamp: endTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch, start: 1638446653, },
    [CHAIN.POLYGON]: { fetch, start: 1627560253, },
    [CHAIN.ARBITRUM]: { fetch, start: 1679918653, },
    [CHAIN.BASE]: { fetch, start: 1703073853, },
  },
  version: 2
}

export default adapter;
