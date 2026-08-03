import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

// Accountable's public read-only endpoint serves one row per (date, chain),
// already in USD. Citrea vaults are not covered, that chain is not indexed
// upstream, so its fees are absent from these totals.
const API_URL = "https://yield.accountable.capital/api/protocol/fees-daily";

interface FeeRow {
  date: string; // YYYY-MM-DD, UTC
  chain: string;
  fees_usd: number;
  supply_side_usd: number;
  protocol_revenue_usd: number;
  manager_revenue_usd?: number;
}

// The endpoint returns the whole history on every call, so one in-flight request
// serves every (chain, day) fetch. A failure is not memoized, otherwise one blip
// would fail every remaining fetch in the run.
let rowsPromise: Promise<FeeRow[]> | undefined;
const getRows = (): Promise<FeeRow[]> => {
  if (!rowsPromise)
    rowsPromise = httpGet(API_URL).catch((e: any) => {
      rowsPromise = undefined;
      throw e;
    });
  return rowsPromise;
};

const fetch = async (options: FetchOptions) => {
  const rows = await getRows();
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("Accountable fees endpoint returned no rows");

  const row = rows.find(
    (r) => r.date === options.dateString && r.chain === options.chain,
  );

  // Days with no accrual are filtered out upstream, so a gap inside the covered
  // range is a genuine zero, while a date past the last row means the upstream
  // accounting is behind.
  if (!row) {
    const lastDate = rows.reduce(
      (max, r) => (r.chain === options.chain && r.date > max ? r.date : max),
      "",
    );
    if (options.dateString > lastDate)
      throw new Error(
        `Accountable: fee data for ${options.chain} ends at ${lastDate}, asked for ${options.dateString}`,
      );
    return {
      dailyFees: 0,
      dailyUserFees: 0,
      dailySupplySideRevenue: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
    };
  }

  const fees = row.fees_usd ?? 0;
  const depositors = row.supply_side_usd ?? 0;
  const protocol = row.protocol_revenue_usd ?? 0;
  const manager =
    row.manager_revenue_usd ?? Math.max(0, fees - depositors - protocol);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (fees > 0) dailyFees.addUSDValue(fees, METRIC.BORROW_INTEREST);
  if (depositors > 0)
    dailySupplySideRevenue.addUSDValue(
      depositors,
      "Borrow Interest To Depositors",
    );
  if (manager > 0)
    dailySupplySideRevenue.addUSDValue(
      manager,
      "Performance Fee To Vault Manager",
    );
  if (protocol > 0)
    dailyProtocolRevenue.addUSDValue(protocol, "Performance Fee To Protocol");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Interest accrued by borrowers drawing on Accountable vaults, including the performance fee charged on it, aggregated per day and chain.",
  UserFees:
    "Same as Fees — the whole amount is paid by borrowers drawing on the vaults.",
  Revenue: "The Accountable protocol's share of the performance fee.",
  ProtocolRevenue: "The Accountable protocol's share of the performance fee.",
  SupplySideRevenue:
    "Interest paid out to vault depositors, plus the vault manager's share of the performance fee, which leaves the protocol and is not protocol revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]:
      "All interest accrued by borrowers on drawn vault capital, before the performance fee is taken out of it.",
  },
  UserFees: {
    [METRIC.BORROW_INTEREST]: "Borrowers pay the whole amount.",
  },
  Revenue: {
    "Performance Fee To Protocol":
      "The Accountable protocol's share of the performance fee charged on borrow interest.",
  },
  ProtocolRevenue: {
    "Performance Fee To Protocol":
      "The Accountable protocol's share of the performance fee charged on borrow interest.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Depositors":
      "Interest distributed to vault depositors, net of the performance fee.",
    "Performance Fee To Vault Manager":
      "The vault manager's share of the performance fee. The manager is an external party running the strategy, so this is a cost of funds rather than protocol revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.MONAD]: { start: "2025-11-27" },
    [CHAIN.ETHEREUM]: { start: "2026-01-16" },
    [CHAIN.BASE]: { start: "2026-04-23" },
    [CHAIN.ARBITRUM]: { start: "2026-05-19" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
