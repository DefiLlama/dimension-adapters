import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Track USDC transfers into the insurance fund from the fee vault.
  // Insurance receives a share of all protocol fees:
  //   - 25% of trading fees (2% on opens/closes)
  //   - 20% of funding fees
  //   - 44% of liquidation collateral
  //
  // Total fees ≈ insurance_inflow * 4 (insurance gets ~25% of trading fees).
  // Source: https://pokeliquid.xyz/docs — Fee Structure section

  const query = `
    SELECT
      COALESCE(SUM(amount / 1e6), 0) AS insurance_in
    FROM tokens_solana.transfers
    WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' -- USDC mint: https://explorer.solana.com/address/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
      AND to_token_account = '266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9'   -- Pokeliquid insurance fund
      AND from_token_account = 'BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt' -- Pokeliquid fee vault
      AND TIME_RANGE
  `;

  const result = await queryDuneSql(options, query);
  const row = result[0] || { insurance_in: 0 };

  const insuranceIn = Number(row.insurance_in) || 0;
  // Insurance receives 25% of trading fees per protocol fee structure.
  // Multiply by 4 to derive total fees. Source: https://pokeliquid.xyz/docs
  const fees = insuranceIn * 4;

  // Fee split: 50% to LP (supply side), 50% to protocol (25% insurance + 25% treasury)
  // Invariant: dailyFees = dailyRevenue + dailySupplySideRevenue
  dailyFees.addUSDValue(fees, "Trading Fees");
  dailyRevenue.addUSDValue(fees * 0.5, "Trading Fees To Protocol");
  dailySupplySideRevenue.addUSDValue(fees * 0.5, "Trading Fees To LPs");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees (2% of position size) on opens and closes, plus funding fees and liquidation penalties.",
  Revenue: "50% of all fees: 25% to protocol treasury + 25% to insurance fund.",
  SupplySideRevenue: "50% of all fees distributed pro-rata to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "All protocol fees: 2% trading fee on opens/closes, funding fees from majority-side positions, and liquidation penalties.",
  },
  Revenue: {
    "Trading Fees To Protocol": "50% of all fees retained by the protocol (25% treasury + 25% insurance fund).",
  },
  SupplySideRevenue: {
    "Trading Fees To LPs": "50% of all fees distributed pro-rata to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-05-20",
      meta: {
        methodology,
        breakdownMethodology,
      },
    },
  },
};

export default adapter;
