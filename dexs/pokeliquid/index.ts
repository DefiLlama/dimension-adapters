import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = "https://pokeliquid.xyz/api/keeper";

// Fee distribution rates (from on-chain program):
// Trading fees (2% open + 2% close): 50% LP, 25% insurance, 25% platform
// Funding fees (hourly settlement):  70% LP, 20% insurance, 10% platform
// Liquidation fees:                  44% LP, 44% insurance, 2% liquidator, 10% platform

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(`${API}/daily-volume?date=${options.dateString}`);

  const tradingFees = res.tradingFees ?? 0;
  const fundingFees = res.fundingFees ?? 0;
  const liquidationFees = res.liquidationFees ?? 0;
  const totalFees = tradingFees + fundingFees + liquidationFees;

  // Supply side: LPs + liquidator rewards + insurance fund
  const tradingToLPs = tradingFees * 0.50;
  const tradingToInsurance = tradingFees * 0.25;
  const fundingToLPs = fundingFees * 0.70;
  const fundingToInsurance = fundingFees * 0.20;
  const liqToLPs = liquidationFees * 0.44;
  const liqToInsurance = liquidationFees * 0.44;
  const liqToLiquidator = liquidationFees * 0.02;
  const supplySide = tradingToLPs + tradingToInsurance + fundingToLPs + fundingToInsurance + liqToLPs + liqToInsurance + liqToLiquidator;

  // Protocol revenue: platform's share
  const revenue = totalFees - supplySide;

  return {
    dailyVolume: res.dailyVolume,
    dailyFees: totalFees,
    dailySupplySideRevenue: supplySide,
    dailyRevenue: revenue,
    dailyProtocolRevenue: revenue,
  };
};

const methodology = {
  Volume: "Notional value of all perpetual positions opened",
  Fees: "Trading fees (2% open + 2% close), hourly funding fees, and liquidation fees",
  SupplySideRevenue: "Fees distributed to LPs, insurance fund, and liquidators",
  Revenue: "Fees retained by the protocol (platform share)",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-01",
  methodology,
};

export default adapter;
