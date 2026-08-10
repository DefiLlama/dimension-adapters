
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const usdcAddress = '0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1'
const OpenEvent = "event TradeOpened(uint256 tradeId, address trader, uint256 entryPrice, int256 positionSize, uint256 openFee, uint256 executionFee)";
const CloseEvent = "event TradeClosed(uint256 tradeId, address trader, uint256 exitPrice, int256 pnl, uint256 closeFee, uint256 executionFee)";

const PositionContract = '0x05eE95faFe92Af6EA619514E07C90844071c6a7d';

const fetch = async (options: FetchOptions) => {
  
  const dailyFees = options.createBalances();
  const openData: any[] = await options.getLogs({
    target: PositionContract,
    eventAbi: OpenEvent,
  });

  openData.forEach((log: any) => {
    dailyFees.add(usdcAddress, log.executionFee);
    dailyFees.add(usdcAddress, log.openFee);
  });

  const closeData: any[] = await options.getLogs({
    target: PositionContract,
    eventAbi: CloseEvent,
  });

  closeData.forEach((log: any) => {
    dailyFees.add(usdcAddress, log.closeFee);
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Fees from open/close position",
  Revenue: "100% of fees from open/close position goes to the treasury",
  ProtocolRevenue: "100% of revenue from open/close position goes to the treasury",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: '2025-11-01',
  methodology,
}

export default adapter;
