import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BTC_MARKET = "0xB7C609cFfa0e47DB2467ea03fF3e598bF59361A5"
const LIMIT_ORDER_FILLED_ABI = "event LimitOrderFilled(uint256 indexed cycleId, uint256 makerOrderId, uint256 takerOrderId, uint256 size, uint256 limitPrice, uint8 side, address indexed taker, address indexed maker, int256 cashTaker, int256 cashMaker, uint256 btcPrice)"

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  const logs = await options.getLogs({
    target: BTC_MARKET,
    eventAbi: LIMIT_ORDER_FILLED_ABI,
  });
  
  const dailyContracts = logs.reduce((x, l) => x + Number(l.size), 0);
  
  // Divide by 100, as optfun contracts are 0.01 BTC
  const dailyNotionalVolume = options.createBalances();
  dailyNotionalVolume.addCGToken('bitcoin', dailyContracts / 100);
  
  return {
    dailyNotionalVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-06-17',
    },
  }
}

export default adapter;
