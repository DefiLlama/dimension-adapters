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
    easyswapperAddresses: ["0x3988513793bce39f0167064a9f7fc3617faf35ab", "0x2ed1bd7f66e47113672f3870308b5e867c5bb743"],
  },
  [CHAIN.POLYGON]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-polygon/version/latest",
    torosManagerAddress: "0x090e7fbd87a673ee3d0b6ccacf0e1d94fb90da59",
    easyswapperAddresses: ["0xb2f1498983bf9c9442c35f772e6c1ade66a8dede", "0x45b90480d6f643de2f128db091a357c3c90399f2"],
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-arbitrum/version/latest",
    torosManagerAddress: "0xfbd2b4216f422dc1eee1cff4fb64b726f099def5",
    easyswapperAddresses: ["0x80b9411977c4ff8d618f2ac3f29f1e2d623c4d34", "0xa5679c4272a056bb83f039961fae7d99c48529f5"],
  },
  [CHAIN.BASE]: {
    endpoint: "https://api.studio.thegraph.com/query/48129/dhedge-v2-base-mainnet/version/latest",
    torosManagerAddress: "0x5619ad05b0253a7e647bd2e4c01c7f40ceab0879",
    easyswapperAddresses: ["0xe10ed1e5354eed0f7c9d2e16250ba8996c12db7a", "0xa907504d7a4c415b4e6e1d0866d96afe8202f0e5"],
  },
};

const fetchHistoricalFees = async (chainId: CHAIN, startTimestamp: number, endTimestamp: number) => {
  const { endpoint, torosManagerAddress} = CONFIG[chainId];

  let allData = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    try {
      const data = await new GraphQLClient(endpoint).request(query, {
        manager: torosManagerAddress,
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

const getTransferLogs = async (getLogs, poolAddresss: string[]): Promise<any> => {
  return await getLogs({
    targets: poolAddresss,
    topic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
    onlyArgs: true,
    flatten: false,
  });
}

async function addEntryExitFees(dailyFees: any[], chain: CHAIN, getLogs: any) {
  const easyswapperAddresses = CONFIG[chain].easyswapperAddresses;
  const poolAddresses = dailyFees.map(e => e.pool)
  const _transferLogs = await getTransferLogs(getLogs, poolAddresses)
  for (const [index,dailyFeesDto] of dailyFees.entries()) {
    const transferLogs = _transferLogs[index];
    const exitEntryFeeLogs = transferLogs.filter(transfer => {
      const from = transfer.from.toLowerCase();
      const to = transfer.to.toLowerCase();
      const isZeroAddressTransfer = from === ZeroAddress && to === dailyFeesDto.manager.toLowerCase();
      const isEasySwapperTransfer = easyswapperAddresses.includes(from) && to === dailyFeesDto.manager.toLowerCase();
      const isPoolTransfer = from === dailyFeesDto.pool.toLowerCase() && to === dailyFeesDto.manager.toLowerCase();
      const notManagerFeeTransfer = Number(transfer.value) !== Number(dailyFeesDto.managerFee);
      return (isZeroAddressTransfer || isEasySwapperTransfer || isPoolTransfer) && notManagerFeeTransfer;
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

  const dailyFees = await fetchHistoricalFees(chain as CHAIN, startTimestamp, endTimestamp);
  await addEntryExitFees(dailyFees, chain as CHAIN, getLogs);

  return {
    dailyFees: calculateFees(dailyFees),
    dailyRevenue: calculateFees(dailyFees),
    timestamp: endTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch, start: '2021-12-02', },
    [CHAIN.POLYGON]: { fetch, start: '2021-07-29', },
    [CHAIN.ARBITRUM]: { fetch, start: '2023-03-27', },
    [CHAIN.BASE]: { fetch, start: '2023-12-20', },
  },
  version: 2
}

export default adapter;
