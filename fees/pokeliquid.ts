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
  // Total fees ≈ insurance_inflow / 0.25 (slight overcount from funding/liq insurance).
  // This is the most reliable on-chain signal since all fee types flow through insurance.

  const query = `
    SELECT
      COALESCE(SUM(amount / 1e6), 0) AS insurance_in
    FROM tokens_solana.transfers
    WHERE token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      AND to_token_account = '266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9'
      AND from_token_account = 'BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt'
      AND TIME_RANGE
  `;

  const result = await queryDuneSql(options, query);
  const row = result[0] || { insurance_in: 0 };

  const insuranceIn = Number(row.insurance_in) || 0;
  // Insurance gets ~25% of total fees. Derive total from insurance inflow.
  const fees = insuranceIn * 4;

  // Fee split: 50% to LP (supply side), 50% to protocol (25% insurance + 25% treasury)
  // dailyFees = dailyRevenue + dailySupplySideRevenue
  dailyFees.addUSDValue(fees);
  dailyRevenue.addUSDValue(fees * 0.5);
  dailySupplySideRevenue.addUSDValue(fees * 0.5);

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

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-05-20",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
