import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BTC_MARKET = "0xB7C609cFfa0e47DB2467ea03fF3e598bF59361A5"
const LIMIT_ORDER_FILLED_ABI = "event LimitOrderFilled(uint256 indexed cycleId, uint256 makerOrderId, uint256 takerOrderId, uint256 size, uint256 limitPrice, uint8 side, address indexed taker, address indexed maker, int256 cashTaker, int256 cashMaker, uint256 btcPrice)"

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  const logs = await options.getLogs({
    target: BTC_MARKET,
    eventAbi: LIMIT_ORDER_FILLED_ABI,
  });
  
  let dailyNotional = 0;
  let dailyPremium = 0;
  
  for (const log of logs) {
    const size = Number(log.size);
    const btcPrice = Number(log.btcPrice);
    const side = Number(log.side);
    const cashMaker = Number(log.cashMaker);
    
    dailyNotional += size * btcPrice / 100;

    if (side === 0 || side === 2) { // Maker is buyer of option, so pays premium, cashMaker is negative. Abs value will be slightly less
      dailyPremium += Math.abs(cashMaker) / 0.98;
    } else { // Maker is seller, receives premium, cashMaker is positive. Abs value will be slightly more
      dailyPremium += cashMaker / 1.02;
    }
  }
  
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  dailyNotionalVolume.addCGToken('tether', dailyNotional / 1e6);  
  dailyPremiumVolume.addCGToken('tether', dailyPremium / 1e6);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-06-17',
      meta: {
        methodology: {
          NotionalVolume: "Notional volume: size * btcPrice / 100 in USDC.",
          PremiumVolume: "Premium volume: amounts paid by option buyers on CALL_BUY/PUT_BUY sides using min(cashTaker, cashMaker) values.",
        }
      }
    },
  },
}

export default adapter;
