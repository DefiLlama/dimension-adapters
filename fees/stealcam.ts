import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const address = '0x2f60c9cee6450a8090e17a79e3dd2615a1c419eb'
const event_fees_distibute = 'event Stolen (address from, address to, uint256 id, uint256 value)';

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances();
  (await getLogs({
    target: address,
    eventAbi: event_fees_distibute,
  })).map((e: any) => dailyFees.addGasToken(e.value))
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    timestamp
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2023-03-10',
    },
  }
};

export default adapter;
