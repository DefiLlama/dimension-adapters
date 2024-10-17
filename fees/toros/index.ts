import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient } from "graphql-request";
import { ZeroAddress } from "ethers";

const query = `
      query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!, $first: Int!, $skip: Int!) {
        managerFeeMinteds(
          where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
          first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc
        ) { managerFee, tokenPriceAtFeeMint, pool, manager, block }
      }`
// gql`
//   query managerFeeMinteds($manager: Bytes!, $startTimestamp: BigInt!, $endTimestamp: BigInt!) {
//     managerFeeMinteds(
//       where: { manager: $manager, managerFee_not: 0, blockTimestamp_gte: $startTimestamp, blockTimestamp_lte: $endTimestamp },
//       first: 1000, orderBy: blockTimestamp, orderDirection: asc
//     ) { managerFee, daoFee, tokenPriceAtLastFeeMint }
//   }`,
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

const getTransferLogs = async (chain: string, getLogs, poolAddress: string, fromBlock: number, toBlock: number): Promise<any> => {
  return await getLogs({
    target: poolAddress,
    topic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    fromBlock: fromBlock,
    toBlock: toBlock,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    onlyArgs: true,
  });
}

async function addEntryExitFees(dailyFees: any[], chain: CHAIN, getLogs: any) {
  for (const dailyFeesDto of dailyFees) {
    const transferLogs = await getTransferLogs(chain.toString(), getLogs, dailyFeesDto.pool, +dailyFeesDto.block, +dailyFeesDto.block);
    const exitEntryFeeLogs = transferLogs.filter(transfer => {
      return (transfer.from.toLowerCase() === ZeroAddress
          && transfer.to.toLowerCase() === dailyFeesDto.manager.toLowerCase()
          && Number(transfer.value) !== Number(dailyFeesDto.managerFee))
            || (transfer.from.toLowerCase() === dailyFeesDto.pool.toLowerCase()
              && transfer.to.toLowerCase() === dailyFeesDto.manager.toLowerCase()
              && Number(transfer.value) !== Number(dailyFeesDto.managerFee));
    });

    if (exitEntryFeeLogs !== null && exitEntryFeeLogs.length > 0) {
      const exitEntryFeeFormatted = Number(exitEntryFeeLogs[0].value) / 1e18;
      const tokenPriceFormatted = Number(dailyFeesDto.tokenPriceAtFeeMint) / 1e18;
      dailyFeesDto.exitEntryFeeUsd = exitEntryFeeFormatted * tokenPriceFormatted;
    } else dailyFeesDto.exitEntryFeeUsd = Number(0);
  }
}

const calculateFees = (dailyFees: any): number =>
    dailyFees.reduce((acc: number, dailyFeesDto: any) => {
      const managerFee = Number(dailyFeesDto.managerFee);
      const tokenPrice = Number(dailyFeesDto.tokenPriceAtFeeMint);
      const managerFeeFormatted = managerFee / 1e18;
      const tokenPriceFormatted = tokenPrice / 1e18;
      const managerFeeUsd = managerFeeFormatted * tokenPriceFormatted + dailyFeesDto.exitEntryFeeUsd;
      return acc + managerFeeUsd;
    }, 0);

const fetch = async ({ chain, getLogs, endTimestamp, startTimestamp }: FetchOptions) => {
  const config = CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const dailyFees = await fetchHistoricalFees(chain as CHAIN, config.torosManagerAddress, startTimestamp, endTimestamp);
  await addEntryExitFees(dailyFees, chain as CHAIN, getLogs);

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
