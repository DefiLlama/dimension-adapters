import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BTC_MARKET = "0xB7C609cFfa0e47DB2467ea03fF3e598bF59361A5"
const PUMP_MARKET = "0xc97Bd36166f345aB1C5d97c9DF196Ee6fFA2485e"
const LIMIT_ORDER_FILLED_ABI = "event LimitOrderFilled(uint256 indexed cycleId, uint256 makerOrderId, int256 takerOrderId, uint256 size, uint256 limitPrice, uint8 side, address indexed taker, address indexed maker, int256 cashTaker, int256 cashMaker, uint256 btcPrice)"

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  // Get logs from both markets in parallel
  const [btcLogs, pumpLogs] = await Promise.all([
    options.getLogs({
      target: BTC_MARKET,
      eventAbi: LIMIT_ORDER_FILLED_ABI,
    }),
    options.getLogs({
      target: PUMP_MARKET,
      eventAbi: LIMIT_ORDER_FILLED_ABI,
    })
  ]);

  let dailyNotional = 0;
  let dailyPremium = 0;

  // Process logs from both markets using the same logic
  const allLogs = [...btcLogs, ...pumpLogs];

  for (const log of allLogs) {
    const size = Number(log.size);
    // This is mistakenly named 'btcPrice' for both markets. Its the underlying asset's price (btc price for btc market, pump price for pump market)
    const btcPrice = Number(log.btcPrice);
    const limitPrice = Number(log.limitPrice);

    dailyNotional += size * btcPrice / 100;
    dailyPremium += limitPrice * size;
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
  methodology: {
    NotionalVolume: "Notional volume: size * btcPrice / 100 in USDC.",
    PremiumVolume: "Premium volume: amounts paid by option buyers on CALL_BUY/PUT_BUY sides using min(cashTaker, cashMaker) values.",
  },
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-06-17',
    },
  },
}

export default adapter;
