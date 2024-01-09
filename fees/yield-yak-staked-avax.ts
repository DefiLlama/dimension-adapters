import { Adapter, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";



const address = '0x185214FD3696942FBf29Af2983AA7493112777Ae';
const topic_0_distribution = '0xb6bcab815b7a952b8759f2f92fc9981dc1156f6c11bf4dc7e9cb3036495e653a';
const topic_0_paid = '0x4f2d18324ee95128de091ed2adc501295479000ce4c2cec607aeb1b67e189e2f';
const event_distribution = 'event Distribution(uint256 indexed epoch,address indexed by,uint256 amount)';
const event_paid = 'event Paid(uint256 indexed epoch,address indexed payee,uint256 amount)';
const AVAX = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const yield_yak_master = '0x0cf605484a512d3f3435fed77ab5ddc0525daf5f';
const yak_gov = '0x5925c5c6843a8f67f7ef2b55db1f5491573c85eb';
const contract_interface = new ethers.Interface([
  event_distribution,
  event_paid
]);

interface IPaid {
  payee: string;
  amount: string;
}

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.AVAX, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.AVAX, {}));

  const logs_distribution: ILog[] = (await sdk.getEventLogs({
    target: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic_0_distribution],
    chain: CHAIN.AVAX
  })) as ILog[];

  const logs_paid: ILog[] = (await sdk.getEventLogs({
    target: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [topic_0_paid],
    chain: CHAIN.AVAX
  })) as ILog[];


  const avaxAddress = `${CHAIN.AVAX}:${AVAX}`;
  const prices = (await getPrices([avaxAddress], timestamp))
  const dailyFees = logs_distribution.map((e: ILog) => {
    const price = prices[`${CHAIN.AVAX}:${AVAX}`].price;
    const decimals = prices[`${CHAIN.AVAX}:${AVAX}`].decimals;
    const value = contract_interface.parseLog(e);
    const amount = Number(value!.args.amount)
    return (amount / 10 ** decimals) * price;
  }).reduce((a: number, b: number) => a + b, 0);

  const revenue = logs_paid.map((e: ILog) => {
    const value = contract_interface.parseLog(e);
    if (value!.args.payee.toLowerCase() === yield_yak_master.toLowerCase()) {
      const price = prices[`${CHAIN.AVAX}:${AVAX}`].price;
      const decimals = prices[`${CHAIN.AVAX}:${AVAX}`].decimals;
      const value = contract_interface.parseLog(e);
      const amount = Number(value!.args.amount)
      return (amount / 10 ** decimals) * price;
    }
    return 0;
  }).reduce((a, b) => a + b,0)

  const dailyProtocolRevenue = logs_paid.map((e: ILog) => {
    const value = contract_interface.parseLog(e);
    if (value!.args.payee.toLowerCase() === yak_gov.toLowerCase()) {
      const price = prices[`${CHAIN.AVAX}:${AVAX}`].price;
      const decimals = prices[`${CHAIN.AVAX}:${AVAX}`].decimals;
      const value = contract_interface.parseLog(e);
      const amount = Number(value!.args.amount)
      return (amount / 10 ** decimals) * price;
    }
    return 0;
  }).reduce((a, b) => a + b,0)

  const dailyRevenue = dailyFees;
  const dailyHoldersRevenue = revenue;

  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyHoldersRevenue: `${dailyHoldersRevenue}`,
    dailyProtocolRevenue: `${dailyProtocolRevenue}`,
    timestamp
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: async ()  => 1636848000,
    },
  }
}

export default adapter;
