import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";
import { queryDuneSql } from "../helpers/dune";

const USDC = ADDRESSES.solana.USDC;
const LULO_PROGRAM = "FL3X2pRsQ9zHENpZSKDRREtccwJuei8yg9fwDu9UN69Q";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    SELECT
      sum(CASE WHEN lm LIKE '%accrued_interest=%' AND lm LIKE '%protected_accumulated=%'
               THEN cast(regexp_extract(lm, 'accrued_interest=([0-9]+)', 1) AS double) ELSE 0 END) AS gross_yield
    FROM solana.transactions
    CROSS JOIN UNNEST(log_messages) AS u(lm)
    WHERE TIME_RANGE
      AND contains(account_keys, '${LULO_PROGRAM}')
      AND lm LIKE '%accrued_interest=%'`;

  const [row] = await queryDuneSql(options, query);

  const grossYield = Number(row?.gross_yield ?? 0);

  dailyFees.add(USDC, grossYield, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.add(USDC, grossYield, METRIC.ASSETS_YIELDS);

  return {
    dailyFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross yield accrued on stablecoin deposits via Lulo's underlying lending integrations.",
  SupplySideRevenue: "Gross yield paid to depositors and referrers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Gross yield on deposited assets.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yield to depositors and referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-01-01",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;
