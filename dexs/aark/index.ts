
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const usdcAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'


const MoonOrderOpenedV2 = "event MoonOrderOpenedV2(address user, uint32 moonIndex, uint32 marketId, uint32 timestamp, uint64 entryPrice, int64 qty, uint16 leverage, int64 lastAccFundingFactor, uint64 takeProfit, uint48 initMargin, uint48 openFee, uint16 executionFee)";
const MoonOrderClosedV2 = "event MoonOrderClosedV2(address user, uint256 moonIndex, uint32 marketId, uint64 indexPrice, int48 pnl, uint48 closeFee, int48 fundingFee, uint48 userPayback, uint256 timestamp)";
                           
const FuturesManager = '0x0b848a8A5eC8950E67d19E7a21A6Be29F44F685e';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const openData: any[] = await options.getLogs({
    target: FuturesManager,
    eventAbi: MoonOrderOpenedV2,
  });
  const positionQty = new Map<string, number>();
  openData.forEach((log: any) => {
    const entryPrice = Number(log.entryPrice) / 1e8;
    const qty = ((log.qty < 0) ? -Number(log.qty) : Number(log.qty)) / (1e10); // short position to positive value
    const openVolume = entryPrice * qty * 1e6;
    //    console.log('moonIndex:', log.moonIndex, log.entryPrice, 'entryPrice:', entryPrice, 'qty:', qty, 'openVolume:', openVolume);

    positionQty.set(log.moonIndex, qty);
    dailyVolume.add(usdcAddress, openVolume);
  });

  const closeData: any[] = await options.getLogs({
    target: FuturesManager,
    eventAbi: MoonOrderClosedV2,
  });
  closeData.forEach((log: any) => {
    if(positionQty.has(log.moonIndex)){
      const qty = positionQty.get(log.moonIndex)!;
      const indexPrice = Number(log.indexPrice) / 1e8;
      const closeVolume = indexPrice * qty * 1e6;
      dailyVolume.add(usdcAddress, closeVolume);
      positionQty.delete(log.moonIndex);
    }else{
      //console.log(`No matching open position for close event with moonIndex: ${log.moonIndex}`);
    }
  });

  return { dailyVolume };
};

const methodology = {
  dailyVolume: 'Perp Volume: Notional volume of all trades in the protocol, includes leverage',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-11-01',
  methodology
}

export default adapter;
