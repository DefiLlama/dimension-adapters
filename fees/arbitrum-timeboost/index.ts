import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const AUCTIONRESOLVED_EVENT_ABI = 'event AuctionResolved(bool indexed isMultiBidAuction, uint64 round, address indexed firstPriceBidder, address indexed firstPriceExpressLaneController, uint256 firstPriceAmount, uint256 price, uint64 roundStartTimestamp, uint64 roundEndTimestamp)'

const WETH_ADDRESS = ADDRESSES.arbitrum.WETH;

const fetch = async (options: FetchOptions) => {
  const { createBalances } = options;
  const dailyFees = createBalances();

  const logs = await options.getLogs({
    target: '0x5fcb496a31b7ae91e7c9078ec662bd7a55cd3079',
    eventAbi: AUCTIONRESOLVED_EVENT_ABI,
  });

  logs.map((log: any) => {
    dailyFees.add(WETH_ADDRESS, log.price, METRIC.TRANSACTION_PRIORITY_FEES);
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRANSACTION_PRIORITY_FEES]: 'Fees paid by users in Timeboost auctions to obtain priority transaction execution rights for specific time slots',
  },
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.ARBITRUM],
  fetch,
  start: '2021-08-10',
  pullHourly: true,
  methodology: {
    Fees: 'All priority/boost ETH fees paid by users for transactions.',
    Revenue: 'All fees go to Arbitrum protocol treasury.',
    ProtocolRevenue: 'All fees go to Arbitrum protocol treasury.',
  },
  breakdownMethodology,
}

export default adapter;
