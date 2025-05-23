import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const AUCTIONRESOLVED_EVENT_ABI = 'event AuctionResolved(bool indexed isMultiBidAuction, uint64 round, address indexed firstPriceBidder, address indexed firstPriceExpressLaneController, uint256 firstPriceAmount, uint256 price, uint64 roundStartTimestamp, uint64 roundEndTimestamp)'

const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async (options: FetchOptions) => {
        const { getFromBlock, getToBlock, createBalances, } = options
        const dailyRevenue = createBalances()

        const logs = await options.getLogs({
            target: '0x5fcb496a31b7ae91e7c9078ec662bd7a55cd3079',
            eventAbi: AUCTIONRESOLVED_EVENT_ABI,
        });

        logs.map((log: any) => {
            dailyRevenue.add(WETH_ADDRESS, log.price);
        });

        return { dailyFees: dailyRevenue, dailyRevenue: dailyRevenue, dailyProtocolRevenue: dailyRevenue };
      }) as any,
      start: '2021-08-10',
    },
  },
  version: 2
}

export default adapter;
