import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import fetchURL from "../utils/fetchURL";

// Daily Sui network revenue published by the data team. Keyed by "YYYY-MM-DD",
// already filtered to non-anomalous rows, starts 2026-01-01 and lags ~3 days.
const REVENUE_URL = 'https://storage.googleapis.com/sui-public-data/sui-revenue.json';

const fetch = async (options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    SELECT
        sum(gas_fees_mist) as tx_fees,
        sum(gas_non_refundable_storage_fee) as storage_fee_burnt
    FROM ${options.chain}.raw.transaction_blocks
    where _created_at BETWEEN '${start}' AND '${end}'
  `;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // On-chain gas, denominated in SUI.
  dailyFees.addCGToken('sui', res[0].tx_fees / 10 ** 9);
  dailyRevenue.addCGToken('sui', res[0].storage_fee_burnt / 10 ** 9);
  dailyHoldersRevenue.addCGToken('sui', res[0].storage_fee_burnt / 10 ** 9);

  // Yield earned on the reserves backing the USDsui and suiUSDe stablecoins (USD).
  // Available from 2026-01-01 with a ~3-day lag; absent days simply report gas only.
  const revenueByDate = await fetchURL(REVENUE_URL);
  const day = revenueByDate[options.dateString];
  if (day) {
    dailyFees.addUSDValue(day.STABLECOIN_YIELD_REVENUE_USD);
    dailyRevenue.addUSDValue(day.STABLECOIN_YIELD_REVENUE_USD);
    dailyProtocolRevenue.addUSDValue(day.STABLECOIN_YIELD_REVENUE_USD);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: "Transaction fees paid by users on the Sui network, plus yield earned on the reserves backing the USDsui and suiUSDe stablecoins",
  Revenue: "Non-refundable storage fees, permanently locked in the storage fund (removed from circulation), plus the stablecoin reserve yield retained by the Sui Foundation",
  HoldersRevenue: "Non-refundable storage fees, permanently locked in the storage fund — removing SUI from circulation (deflationary, benefiting holders)",
  ProtocolRevenue: "Yield earned on the USDsui and suiUSDe reserves, retained by the Sui Foundation",
}

// Daily (no pullHourly): the stablecoin yield from the revenue JSON is a daily
// figure and would be overcounted ~24x if fetch ran hourly. Gas totals are a
// SUM over the full-day window, so daily is exactly as accurate as hourly.
const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;
