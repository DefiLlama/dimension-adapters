import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import BigNumber from "bignumber.js";

const channels_address = '0x693Bac5ce61c720dDC68533991Ceb41199D8F8ae';
const wxHOPR_address = '0xd4fdec44db9d44b8f2b6d529620f9c0c7066a2c1';
const xHOPR_address = '0xd057604a14982fe8d88c5fc25aac3267ea142a08';
const chain = 'xdai';
const topic0 = '0x7165e2ebc7ce35cc98cb7666f9945b3617f3f36326b76d18937ba5fecf18739a'; //TicketRedeemed
const topic1 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; //Transfer 

const methodology = {
  Fees: "Protocol has no supply-side fees, only user fees which are Sum of all ticket values redeemed in wxHOPR",
  Revenue: "Sum of number of all tickets times ticket price in wxHOPR",
}

interface ITx {
  data: string;
  transactionHash: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.XDAI, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.XDAI, {}));

  const ticketRedeemedLogs: ITx[] = (await sdk.api.util.getLogs({
    target: channels_address,
    topic: topic0,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic0],
    keys: [],
    chain: CHAIN.XDAI
  })).output as ITx[];

  const erc20transferLog: ITx[] = (await sdk.api.util.getLogs({
    target: wxHOPR_address,
    topic: topic1,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic1],
    keys: [],
    chain: CHAIN.XDAI
  })).output as ITx[];

  const dailyRevenueArray = ticketRedeemedLogs.map(ticket => {
    const transactionHash = ticket.transactionHash;
    const index = erc20transferLog.findIndex(transaction => transaction.transactionHash === transactionHash);
    if(index !== -1) {
      return erc20transferLog[index].data;
    }
  }).filter(elem => elem !== undefined) as string[];

  const dailyRevenue = dailyRevenueArray.map((data: string) => {
    const amount = Number(data) / 10 ** 18;
    return amount;
  }).reduce((a: number, b: number) => a+b,0);

  const prices: any = (await getPrices([`${chain}:${xHOPR_address}`], toTimestamp));
  const price = prices[`${chain}:${xHOPR_address}`]?.price || 0;
  const dailyRevenueUSD = dailyRevenue * price;

  return {
    timestamp: timestamp,
    dailyFees: `0`,
    dailyUserFees: `${dailyRevenueUSD}`,
    dailyRevenue: `${dailyRevenueUSD}`
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.XDAI]: {
      fetch: fetch,
      start: async () => 1693440000,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
