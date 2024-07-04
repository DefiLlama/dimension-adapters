import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";

const topic0_evt_transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topic2_evt_transfer = "0x0000000000000000000000001b5e59759577fa0079e2a35bc89143bc0603d546";
const topic2_evt_transfer_2 = "0x000000000000000000000000d5ac6419635aa6352ebade0ab42d25fbfa570d21";
const usdc = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const usdce = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24; // 24 hours before
  const fromBlock = await getBlock(fromTimestamp, CHAIN.ARBITRUM, {});
  const toBlock = await getBlock(toTimestamp, CHAIN.ARBITRUM, {});

  // Fetch logs for the first topic
  const logsForFirstTopic: ILog[] = (await sdk.getEventLogs({
    targets: [usdc, usdce],
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ARBITRUM,
    topics: [topic0_evt_transfer, null, topic2_evt_transfer], // Adjusted for a single topic
  })) as ILog[];

  // Fetch logs for the second topic
  const logsForSecondTopic: ILog[] = (await sdk.getEventLogs({
    targets: [usdc, usdce],
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ARBITRUM,
    topics: [topic0_evt_transfer, null, topic2_evt_transfer_2], // Adjusted for a single topic
  })) as ILog[];

  // Combine logs from both calls
  const combinedLogs = [...logsForFirstTopic, ...logsForSecondTopic];

  // Calculate daily fees from combined logs
  const dailyFees = combinedLogs.reduce((acc: number, log: ILog) => {
    const amount = Number(log.data) / 10 ** 6; // Assuming 6 decimals for USDC and USDC.e
    return acc + amount;
  }, 0);

  return {
    dailyFees: `${dailyFees}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: 1691596800,
      meta: {
        methodology: {
          UserFees: "15% of management fee and 0.08%-0.2% withdrawal fee across all the strategies, for details, check our official documentation",
          Fees: "15% of management fee and 0.08%-0.2% withdrawal fee across all the strategies, for details, check our official documentation",
        },
      },
    },
  },
};
export default adapter;
