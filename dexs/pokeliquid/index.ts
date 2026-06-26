import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const API = "https://pokeliquid.xyz/api/keeper";

// https://www.pokeliquid.xyz/docs#fees
// Fee distribution rates (from on-chain program):
// Trading fees (2% open + 2% close): 50% LP, 25% insurance, 25% platform
// Funding fees (hourly settlement):  70% LP, 20% insurance, 10% platform
// Liquidation fees:                  44% LP, 44% insurance, 2% liquidator, 10% platform

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(`${API}/daily-volume?date=${options.dateString}`);

  if(!res || res.dailyVolume == undefined || res.tradingFees == undefined || res.fundingFees == undefined || res.liquidationFees == undefined)
    throw new Error(`No data found for ${options.dateString}`);

  const tradingFees = res.tradingFees;
  const fundingFees = res.fundingFees;
  const liquidationFees = res.liquidationFees;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyVolume.addUSDValue(res.dailyVolume);

  dailyFees.addUSDValue(tradingFees, METRIC.TRADING_FEES);
  dailyFees.addUSDValue(fundingFees, 'Funding Fees');
  dailyFees.addUSDValue(liquidationFees, METRIC.LIQUIDATION_FEES);

  dailySupplySideRevenue.addUSDValue(tradingFees * 0.5, 'Trading Fees to LPs');
  dailySupplySideRevenue.addUSDValue(tradingFees * 0.25, 'Trading Fees to Insurance Fund');
  dailySupplySideRevenue.addUSDValue(fundingFees * 0.70, 'Funding Fees to LPs');
  dailySupplySideRevenue.addUSDValue(fundingFees * 0.20, 'Funding Fees to Insurance Fund');
  dailySupplySideRevenue.addUSDValue(liquidationFees * 0.44, 'Liquidation Fees to LPs');
  dailySupplySideRevenue.addUSDValue(liquidationFees * 0.44, 'Liquidation Fees to Insurance Fund');
  dailySupplySideRevenue.addUSDValue(liquidationFees * 0.02, 'Liquidation Fees to Liquidator');

  dailyRevenue.addUSDValue(tradingFees * 0.25, 'Trading Fees to Platform');
  dailyRevenue.addUSDValue(fundingFees * 0.10, 'Funding Fees to Platform');
  dailyRevenue.addUSDValue(liquidationFees * 0.10, 'Liquidation Fees to Platform');

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Notional value of all perpetual positions opened",
  Fees: "Trading fees (2% open + 2% close), hourly funding fees, and liquidation fees",
  UserFees: "Trading fees (2% open + 2% close), hourly funding fees, and liquidation fees",
  SupplySideRevenue: "Fees distributed to LPs, insurance fund, and liquidators",
  Revenue: "Fees retained by the protocol (platform share)",
  ProtocolRevenue: "Fees retained by the protocol (platform share)",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees charged on position open (2%) and close (2%)",
    'Funding Fees': "Hourly funding fees settled between long and short positions",
    [METRIC.LIQUIDATION_FEES]: "Fees charged when positions are liquidated",
  },
  Revenue: {
    'Trading Fees to Platform': "25% of trading fees retained by the platform",
    'Funding Fees to Platform': "10% of funding fees retained by the platform",
    'Liquidation Fees to Platform': "10% of liquidation fees retained by the platform",
  },
  ProtocolRevenue: {
    'Trading Fees to Platform': "25% of trading fees retained by the platform",
    'Funding Fees to Platform': "10% of funding fees retained by the platform",
    'Liquidation Fees to Platform': "10% of liquidation fees retained by the platform",
  },
  SupplySideRevenue: {
    'Trading Fees to LPs': "50% of trading fees to liquidity providers",
    'Trading Fees to Insurance Fund': "25% of trading fees to insurance fund",
    'Funding Fees to LPs': "70% of funding fees to liquidity providers",
    'Funding Fees to Insurance Fund': "20% of funding fees to insurance fund",
    'Liquidation Fees to LPs': "44% of liquidation fees to liquidity providers",
    'Liquidation Fees to Insurance Fund': "44% of liquidation fees to insurance fund",
    'Liquidation Fees to Liquidator': "2% of liquidation fees to liquidator",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-06-06",
  methodology,
  breakdownMethodology,
};

export default adapter;
