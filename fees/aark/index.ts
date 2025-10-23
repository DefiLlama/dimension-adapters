import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const usdcAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

const MoonOrderOpenedV2 = "event MoonOrderOpenedV2(address user, uint32 moonIndex, uint32 marketId, uint32 timestamp, uint64 entryPrice, int64 qty, uint16 leverage, int64 lastAccFundingFactor, uint64 takeProfit, uint48 initMargin, uint48 openFee, uint16 executionFee)";
const MoonOrderClosedV2 = "event MoonOrderClosedV2(address user, uint256 moonIndex, uint32 marketId, uint64 indexPrice, int48 pnl, uint48 closeFee, int48 fundingFee, uint48 userPayback, uint256 timestamp)";
                           
const FuturesManager = '0x0b848a8A5eC8950E67d19E7a21A6Be29F44F685e';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const openData: any[] = await options.getLogs({
    target: FuturesManager,
    eventAbi: MoonOrderOpenedV2,
  });

  openData.forEach((log: any) => {
    dailyFees.add(usdcAddress, log.executionFee);
    dailyFees.add(usdcAddress, log.openFee);
  });

  const closeData: any[] = await options.getLogs({
    target: FuturesManager,
    eventAbi: MoonOrderClosedV2,
  });

  closeData.forEach((log: any) => {
    dailyFees.add(usdcAddress, log.closeFee);
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 };
};

const methodology = {
  Fees: 'All fees paid by users for executionFee, openFee, closeFee.',
  Revenue: 'trade open/close/execution fees to protocol.',
  ProtocolRevenue: 'trade open/close/execution fees to protocol.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-11-01',
  methodology
}

export default adapter;
