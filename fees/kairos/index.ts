import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getETHReceived } from "../../helpers/token";

// 0x64a0ddF7469d52828a026b98A76F194637DaAd2C(ExpressLanAuction Contract)

// https://docs.kairos-timeboost.xyz/submission-api
const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const KAIROS_PAYMENT_ADDRESS = '0x60E6a31591392f926e627ED871e670C3e81f1AB8';
const KAIROS_AUCTION_BIDDER_ADDRESS = '0x2b38a73dd32a2eafe849825a4b515ae5187eda42';

const AUCTIONRESOLVED_EVENT_ABI = 'event AuctionResolved(bool indexed isMultiBidAuction, uint64 round, address indexed firstPriceBidder, address indexed firstPriceExpressLaneController, uint256 firstPriceAmount, uint256 price, uint64 roundStartTimestamp, uint64 roundEndTimestamp)'

const fetchFees = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyCost = options.createBalances();

    const logs = await options.getLogs({
      target: '0x5fcb496a31b7ae91e7c9078ec662bd7a55cd3079',
      eventAbi: AUCTIONRESOLVED_EVENT_ABI
    });

    await getETHReceived({ options, balances: dailyFees, target: KAIROS_PAYMENT_ADDRESS });

    logs.map((log: any) => {
      if (log.firstPriceBidder.toLowerCase() === KAIROS_AUCTION_BIDDER_ADDRESS.toLowerCase()) {
        dailyCost.add(WETH_ADDRESS, log.price);
      }
    });

    const dailyRevenue = dailyFees.clone();
    dailyRevenue.subtract(dailyCost);

    return {
        dailyFees,
        dailyRevenue
    }
}

// version 1 as it's using allium query
const adapter: SimpleAdapter = {
  allowNegativeValue: true, // Kairos pre-pays gas/auction costs for Arbitrum Timeboost slots.
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees as any,
      start: '2025-04-16',
      meta: {
        "methodology": "kairos pay for auction bids upfront, we subtract the cost from the fees to get the revenue"
      }
    },
  },
  isExpensiveAdapter: true,
}

export default adapter;