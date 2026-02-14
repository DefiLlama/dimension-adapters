import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const STEAL_FEE_LABEL = "Steal fees";

const address = '0x2f60c9cee6450a8090e17a79e3dd2615a1c419eb'
const event_fees_distibute = 'event Stolen (address from, address to, uint256 id, uint256 value)';

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances();
  (await getLogs({
    target: address,
    eventAbi: event_fees_distibute,
  })).map((e: any) => dailyFees.addGasToken(e.value, STEAL_FEE_LABEL))
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    timestamp
  }
}


const methodology = {
  Fees: "Fees paid when users 'steal' NFT-backed photos from other users",
  Revenue: "All steal fees are retained by the protocol"
}

const breakdownMethodology = {
  Fees: {
    [STEAL_FEE_LABEL]: "Fees paid by users to steal NFT-backed photos from other users, where the steal price increases with each transfer"
  },
  Revenue: {
    [STEAL_FEE_LABEL]: "All fees from stealing NFT photos are retained by the protocol"
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2023-03-10',
    },
  },
  methodology,
  breakdownMethodology
};

export default adapter;
