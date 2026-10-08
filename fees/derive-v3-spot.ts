// Derive v3 spot markets: trading fees, revenue and maker rebates
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDeriveTrades } from "../helpers/derive";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const trade of await getDeriveTrades(options, "erc20")) {
    if (!trade.instrument_name.endsWith("-USDC")) continue; // all spot pairs are quoted in USDC, so price is USD
    const fee = Number(trade.trade_fee) + Number(trade.extra_fee);
    const rebate = Number(trade.expected_rebate);
    dailyFees.addUSDValue(fee, "Trading Fees");
    dailySupplySideRevenue.addUSDValue(rebate, "Maker Rebates");
    dailyRevenue.addUSDValue(fee - rebate, "Trading Fees Net Of Rebates");
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.LYRA], // Derive keeps the lyra chain key after moving to v3
  start: "2024-07-12", // first spot trade on Derive, there was no v2 spot listing
  methodology: {
    Fees: "Trading fees paid by users on Derive spot markets.",
    UserFees: "Trading fees paid by users on Derive spot markets.",
    Revenue: "Trading fees paid by users on Derive spot markets, minus rebates paid to market makers.",
    ProtocolRevenue: "Trading fees paid by users on Derive spot markets, minus rebates paid to market makers, kept by the protocol.",
    SupplySideRevenue: "Rebates paid to market makers on Derive spot markets.",
  },
  breakdownMethodology: {
    Fees: { "Trading Fees": "Trading fees and extra fees charged on Derive spot trades." },
    Revenue: { "Trading Fees Net Of Rebates": "Trading fees remaining after maker rebates." },
    SupplySideRevenue: { "Maker Rebates": "Rebates paid to market makers for providing liquidity." },
  },
};

export default adapter;
