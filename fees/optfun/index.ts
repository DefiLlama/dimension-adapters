import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// V1 On-chain execution contracts (before off-chain transition)
const BTC_MARKET = "0xB7C609cFfa0e47DB2467ea03fF3e598bF59361A5"
const PUMP_MARKET = "0xc97Bd36166f345aB1C5d97c9DF196Ee6fFA2485e"
const LIMIT_ORDER_FILLED_ABI = "event LimitOrderFilled(uint256 indexed cycleId, uint256 makerOrderId, int256 takerOrderId, uint256 size, uint256 limitPrice, uint8 side, address indexed taker, address indexed maker, int256 cashTaker, int256 cashMaker, uint256 btcPrice)"

// V2 Off-chain execution contract (after off-chain transition)
const SETTLEMENT_ENGINE = "0x7dB5B94c875d12bB77062d368d36D43EAbB6A961"
const FEE_RECIPIENT = "0x17f8dec583Ab9af5De05FBBb4d4C2bfE767A0AC3"
const SETTLED_ABI = "event Settled(address indexed market, uint256 indexed cycleId, address indexed trader, int256 pnl)"

// Off-chain transition date
const OFFCHAIN_TRANSITION_TIMESTAMP = new Date('2025-09-25').getTime() / 1000; // September 25, 2025

// V1: On-chain execution logic (before off-chain transition)
async function fetchV1OnChain(options: FetchOptions) {
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

  let totalFees = 0;

  // Process logs from both markets
  const allLogs = [...btcLogs, ...pumpLogs];

  for (const log of allLogs) {
    const size = Number(log.size);
    const limitPrice = Number(log.limitPrice);

    // Fees = 5% of (size * limitPrice)
    // Takers pay 7%, makers get 2% rebate, net 5% to protocol. This is hardcoded in the old v1 contract state
    totalFees += size * limitPrice * 0.05;
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addCGToken('tether', totalFees / 1e6);
  dailyRevenue.addCGToken('tether', totalFees / 1e6);
  dailyProtocolRevenue.addCGToken('tether', totalFees / 1e6);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
}

// V2: Off-chain execution logic (after off-chain transition)
async function fetchV2OffChain(options: FetchOptions) {
  const logs = await options.getLogs({
    target: SETTLEMENT_ENGINE,
    eventAbi: SETTLED_ABI,
  });

  let totalFees = 0;

  // Filter for events where trader is the FEE_RECIPIENT and sum the pnl values
  for (const log of logs) {
    if (log.trader.toLowerCase() === FEE_RECIPIENT.toLowerCase()) {
      // pnl is int256, can be negative but fees to FEE_RECIPIENT should be positive
      const pnl = Number(log.pnl);
      if (pnl > 0) {
        totalFees += pnl;
      }
    }
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addCGToken('tether', totalFees / 1e6);
  dailyRevenue.addCGToken('tether', totalFees / 1e6);
  dailyProtocolRevenue.addCGToken('tether', totalFees / 1e6);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
}

// Main fetch function that routes based on timestamp
async function fetch(options: FetchOptions) {
  // Check if the current period is before or after the off-chain transition
  if (options.startOfDay < OFFCHAIN_TRANSITION_TIMESTAMP) {
    // Use V1 on-chain execution logic for historical data before transition
    return fetchV1OnChain(options);
  } else {
    // Use V2 off-chain execution logic for data after transition
    return fetchV2OffChain(options);
  }
}

const adapter: Adapter = {
  methodology: {
    Fees: "V1: Trading fees calculated as 5% of trade value (size * limitPrice) from LimitOrderFilled events. Net after taker fee/maker rebate is 5% to protocol. V2 (After Sept 25, 2025): Fees extracted from Settled events where the fee recipient receives positive pnl, including trading fees and liquidation penalties. Same 5% net fee to protocol.",
    Revenue: "All fees collected go directly to the protocol treasury",
    ProtocolRevenue: "100% of fees are retained by the protocol",
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
