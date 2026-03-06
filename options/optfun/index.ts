import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// V1 On-chain execution contracts (before off-chain transition)
const BTC_MARKET = "0xB7C609cFfa0e47DB2467ea03fF3e598bF59361A5"
const PUMP_MARKET = "0xc97Bd36166f345aB1C5d97c9DF196Ee6fFA2485e"
const LIMIT_ORDER_FILLED_ABI = "event LimitOrderFilled(uint256 indexed cycleId, uint256 makerOrderId, int256 takerOrderId, uint256 size, uint256 limitPrice, uint8 side, address indexed taker, address indexed maker, int256 cashTaker, int256 cashMaker, uint256 btcPrice)"

// V2 Off-chain execution contract (after off-chain transition)
const OPTFUN_CONTRACT = "0x7dB5B94c875d12bB77062d368d36D43EAbB6A961"
const CYCLE_SETTLED_ABI = "event CycleSettled(uint256 indexed cycleId, uint256 notionalVolume, uint256 premiumVolume)"

// Off-chain transition date - Please update with the actual transition date
// Using a placeholder date - replace with actual transition timestamp
const OFFCHAIN_TRANSITION_TIMESTAMP = new Date('2025-09-25').getTime() / 1000; // September 25, 2025

// V1: On-chain execution logic (original implementation)
async function fetchV1OnChain(options: FetchOptions): Promise<FetchResult> {
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

// V2: Off-chain execution logic (current implementation)
async function fetchV2OffChain(options: FetchOptions): Promise<FetchResult> {
  const logs = await options.getLogs({
    target: OPTFUN_CONTRACT,
    eventAbi: CYCLE_SETTLED_ABI,
  });

  let dailyNotional = 0;
  let dailyPremium = 0;

  for (const log of logs) {
    const notionalVolume = Number(log.notionalVolume);
    const premiumVolume = Number(log.premiumVolume);
    dailyNotional += notionalVolume;
    dailyPremium += premiumVolume;
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

// Main fetch function that routes based on timestamp
export async function fetch(options: FetchOptions): Promise<FetchResult> {
  // Check if the current period is before or after the off-chain transition
  if (options.startOfDay < OFFCHAIN_TRANSITION_TIMESTAMP) {
    // Use V1 on-chain execution logic for historical data before transition
    return fetchV1OnChain(options);
  } else {
    // Use V2 off-chain execution logic for data after transition
    return fetchV2OffChain(options);
  }
}

const adapter: SimpleAdapter = {
  methodology: {
    NotionalVolume: "V1 (Before Sept 25, 2025): On-chain execution - Notional volume calculated as size * btcPrice / 100 from LimitOrderFilled events. V2 (After Sept 25, 2025): Off-chain execution - Notional volume summed from CycleSettled events in USDC.",
    PremiumVolume: "V1 (Before Sept 25, 2025): Premium volume calculated as limitPrice * size from LimitOrderFilled events. V2 (After Sept 25, 2025): Premium volume summed from CycleSettled events in USDC.",
    OffchainTransition: "Protocol transitioned from on-chain to off-chain execution on Sept 25, 2025. V1 uses LimitOrderFilled events from BTC_MARKET and PUMP_MARKET contracts. V2 uses CycleSettled events from OPTFUN_CONTRACT for aggregated off-chain volume reporting.",
  },
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-06-17',
    },
  },
}

export default adapter;
