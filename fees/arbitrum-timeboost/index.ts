import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const AUCTIONRESOLVED_EVENT_ABI = 'event AuctionResolved(bool indexed isMultiBidAuction, uint64 round, address indexed firstPriceBidder, address indexed firstPriceExpressLaneController, uint256 firstPriceAmount, uint256 price, uint64 roundStartTimestamp, uint64 roundEndTimestamp)'

const WETH_ADDRESS = ADDRESSES.arbitrum.WETH;

const fetch = async (options: FetchOptions) => {
  const { createBalances } = options;
  const dailyRevenue = createBalances();

  const logs = await options.getLogs({
    target: '0x5fcb496a31b7ae91e7c9078ec662bd7a55cd3079',
    eventAbi: AUCTIONRESOLVED_EVENT_ABI,
  });

  logs.map((log: any) => {
    dailyRevenue.add(WETH_ADDRESS, log.price, METRIC.TRANSACTION_PRIORITY_FEES);
  });

  return { dailyFees: dailyRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_PRIORITY_FEES]: 'Fees paid by users in Timeboost auctions to obtain priority transaction execution rights for specific time slots',
  },
  Revenue: {
    [METRIC.TRANSACTION_PRIORITY_FEES]: 'All Timeboost auction fees are collected by the Arbitrum protocol treasury',
  },
  ProtocolRevenue: {
    [METRIC.TRANSACTION_PRIORITY_FEES]: 'All Timeboost auction fees are collected by the Arbitrum protocol treasury',
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2021-08-10',
    },
  },
  methodology: {
    Fees: 'All priority/boost ETH fees paid transactions by users.',
    Revenue: 'All fees go to Arbitrum protocol treasury.',
    ProtocolRevenue: 'All fees go to Arbitrum protocol treasury.',
  },
  breakdownMethodology,
}

export default adapter;
