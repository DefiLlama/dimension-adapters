import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const topic0 = '0xd8d7ecc4800d25fa53ce0372f13a416d98907a7ef3d8d3bdd79cf4fe75529c65'
const request = "event OracleRequest(bytes32 indexed specId, address requester, bytes32 requestId, uint256 payment, address callbackAddr, bytes4 callbackFunctionId, uint256 cancelExpiration, uint256 dataVersion, bytes data)"

const getTotalPaymentFromLogs = async (fromBlock: number, toBlock: number, api: any) => {
  const BATCH_SIZE = 10_000;
  let totalParsedAmount = 0n;

  for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE + 1) {
    const end = Math.min(start + BATCH_SIZE, toBlock);

    const logs = await api.getLogs({
      noTarget: true,
      fromBlock: start,
      toBlock: end,
      topics: [topic0],
      eventAbi: request,
      onlyArgs: true
    });

    logs.forEach(({ payment }: any) => {
      totalParsedAmount += payment
    })
  }

  return totalParsedAmount;
};

const fetch = async (_: any, _1: any, { getFromBlock, getToBlock, createBalances, api }: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const dailyFees = createBalances()
  const amount = await getTotalPaymentFromLogs(fromBlock, toBlock, api)

  dailyFees.addCGToken('chainlink', amount / 10n ** 18n)
  return { dailyFees }
}

const methodology = {
    Fees: "Sum of all fees from Chainlink Requests,Chainlink Keepers,Chainlink VRF V1,Chainlink VRF V2,Chainlink CCIP",
    Revenue: "Sum of all revenue from Chainlink Requests,Chainlink Keepers,Chainlink VRF V1,Chainlink VRF V2,Chainlink CCIP",
    ProtocolRevenue: "Sum of all revenue from Chainlink Requests,Chainlink Keepers,Chainlink VRF V1,Chainlink VRF V2,Chainlink CCIP",
}

const adapter: SimpleAdapter = {
  methodology,
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-02-03',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2023-02-03',
      // runAtCurrTime: true,
    },
  },
  isExpensiveAdapter: true,
}
export default adapter;
