import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Fee share constants (source: https://pokeliquid.xyz/docs)
const TRADING_INSURANCE_SHARE = 0.25; // 25% of trading fees → insurance
const TRADING_LP_SHARE = 0.50; // 50% of trading fees → LPs
// Remaining 25% → protocol treasury

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Track USDC transfers into the insurance fund from the fee vault.
  // The insurance fund receives 25% of all trading fees via on-chain SPL transfers.
  // We derive total trading fees = insurance_inflow / TRADING_INSURANCE_SHARE.
  //
  // Note: insurance also receives 20% of funding fees and 44% of liquidation collateral,
  // but these are small relative to trading fees and are excluded to avoid overcounting.
  // This adapter scopes to trading fees only for accuracy.

  const query = `
    SELECT
      COALESCE(SUM(amount / 1e6), 0) AS insurance_in
    FROM tokens_solana.transfers
    WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' -- USDC mint: https://explorer.solana.com/address/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
      AND to_token_account = '266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9'   -- Insurance fund: https://explorer.solana.com/address/266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9
      AND from_token_account = 'BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt' -- Fee vault: https://explorer.solana.com/address/BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt
      AND TIME_RANGE
  `;

  const result = await queryDuneSql(options, query);
  const row = result[0];

  const insuranceIn = Number(row.insurance_in);
  // Derive total trading fees from insurance inflow.
  // Insurance receives TRADING_INSURANCE_SHARE (25%) of trading fees.
  const fees = insuranceIn / TRADING_INSURANCE_SHARE;

  // Fee split: 50% to LPs (supply side), 50% to protocol (25% insurance + 25% treasury)
  // Invariant: dailyFees = dailyRevenue + dailySupplySideRevenue
  const supplySide = fees * TRADING_LP_SHARE;
  const revenue = fees - supplySide - insuranceIn;

  dailyFees.addUSDValue(fees, "Trading Fees");
  dailyRevenue.addUSDValue(revenue, "Trading Fees To Protocol");
  dailySupplySideRevenue.addUSDValue(supplySide, "Trading Fees To LPs");
  dailySupplySideRevenue.addUSDValue(insuranceIn, "Trading Fees To Insurance Fund");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees (2% of position size) collected on perpetual position opens/closes.",
  Revenue: "Includes 25% of the trading fees retained by the protocol.",
  ProtocolRevenue: "Includes 25% of the trading fees retained by the protocol.",
  SupplySideRevenue: "50% of trading fees distributed pro-rata to liquidity providers and 25% of trading fees to the insurance fund.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "2% fee on position opens and closes, collected in USDC from trader collateral.",
  },
  Revenue: {
    "Trading Fees To Protocol": "Includes 25% of the trading fees retained by the protocol.",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "Includes 25% of the trading fees retained by the protocol.",
  },
  SupplySideRevenue: {
    "Trading Fees To LPs": "50% of trading fees distributed pro-rata to liquidity providers.",
    "Trading Fees To Insurance Fund": "25% of trading fees distributed to the insurance fund.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-06-07",
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
