
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OpenEvent = "event TradeOpened(uint256 tradeId, address trader, uint256 entryPrice, int256 positionSize, uint256 openFee, uint256 executionFee)";
const CloseEvent = "event TradeClosed(uint256 tradeId, address trader, uint256 exitPrice, int256 pnl, uint256 closeFee, uint256 executionFee)";

const PositionContract = '0x05eE95faFe92Af6EA619514E07C90844071c6a7d';

const fetch = async (options: FetchOptions) => {
  
  const dailyVolume = options.createBalances();
  const openData: any[] = await options.getLogs({
    target: PositionContract,
    eventAbi: OpenEvent,
  });
  const positionSize = new Map<string, number>();
  openData.forEach((log: any) => {
    const entryPrice = Number(log.entryPrice) / 1e8;
    const size = Math.abs(Number(log.positionSize)) / (1e10);
    const openVolume = entryPrice * size;
    positionSize.set(log.tradeId, size);
    dailyVolume.addUSDValue(openVolume);
  });

  const closeData: any[] = await options.getLogs({
    target: PositionContract,
    eventAbi: CloseEvent,
  });
  closeData.forEach((log: any) => {
    if (positionSize.has(log.tradeId)) {
      const size = positionSize.get(log.tradeId)!;
      const exitPrice = Number(log.exitPrice) / 1e8;
      const closeVolume = exitPrice * size;
      dailyVolume.addUSDValue(closeVolume);
      positionSize.delete(log.tradeId);
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: '2025-11-01',
}

export default adapter;
