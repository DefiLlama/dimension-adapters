// source: https://docs.opt.fun/fees

import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BTC_MARKET = "0xB7C609cFfa0e47DB2467ea03fF3e598bF59361A5"
const LIMIT_ORDER_FILLED_ABI = "event LimitOrderFilled(uint256 indexed cycleId, uint256 makerOrderId, uint256 takerOrderId, uint256 size, uint256 limitPrice, uint8 side, address indexed taker, address indexed maker, int256 cashTaker, int256 cashMaker, uint256 btcPrice)"
const LIQUIDATED_ABI = "event Liquidated(uint256 indexed cycleId, address indexed trader)"

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  const [tradingLogs, liquidationLogs] = await Promise.all([
    options.getLogs({
      target: BTC_MARKET,
      eventAbi: LIMIT_ORDER_FILLED_ABI,
    }),
    options.getLogs({
      target: BTC_MARKET,
      eventAbi: LIQUIDATED_ABI,
    })
  ]);
  
  const takerFeeBps = 0.07;
  const makerFeeBps = 0.02;
  const liquidationFeeBps = 0.001;
  const contractSize = 100;
  
  let totalPremium = 0;
  let totalTakerFees = 0;
  let totalMakerRebates = 0;
  let liquidationFees = 0;
  
  const liquidationsByTxHash = new Map();
  for (const liquidationLog of liquidationLogs) {
    const txHash = liquidationLog.transactionHash;
    if (!liquidationsByTxHash.has(txHash)) {
      liquidationsByTxHash.set(txHash, []);
    }
    liquidationsByTxHash.get(txHash).push(liquidationLog);
  }
  
  for (const log of tradingLogs) {
    const side = Number(log.side);
    const cashMaker = Number(log.cashMaker);
    const txHash = log.transactionHash;
    
    let premium;
    if (side === 0 || side === 2) {
      premium = Math.abs(cashMaker) / 0.98;
    } else {
      premium = cashMaker / 1.02;
    }
    
    totalPremium += premium;
    
    // // Check if this trade is part of a liquidation
    // const isLiquidation = liquidationsByTxHash.has(txHash);
    
    // if (isLiquidation) {
    //   console.log('liquidation', log);
    //   // Calculate liquidation fees based on actual trade data
    //   const notionalValue = Number(log.size) * Number(log.btcPrice) / contractSize;
    //   liquidationFees += notionalValue * liquidationFeeBps;
    // }
    
    // Calculate taker and maker fees separately
    totalTakerFees += premium * takerFeeBps; // Paid by takers (users)
    totalMakerRebates += premium * makerFeeBps; // Rebates paid to makers by protocol
  }
  
  // dailyUserFees = what users actually pay (taker fees + liquidation fees)
  const totalUserFeesWithLiquidation = totalTakerFees - totalMakerRebates + liquidationFees;
  
  // dailyRevenue = what protocol keeps (taker fees - maker rebates + liquidation fees)
  const totalProtocolRevenue = totalTakerFees - totalMakerRebates + liquidationFees;
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  dailyFees.addCGToken('tether', totalUserFeesWithLiquidation / 1e6);
  dailyRevenue.addCGToken('tether', totalProtocolRevenue / 1e6);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
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
          dailyFees: "Total fees paid by users.",
          dailyRevenue: "Net protocol revenue (7% taker fees - 2% maker rebates + 0.1% liquidation fees).",
          dailyProtocolRevenue: "Net protocol revenue."
        },
      }
    },
  },
}

export default adapter; 