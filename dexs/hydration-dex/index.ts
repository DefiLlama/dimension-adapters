import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = "https://hydration-api.neckwork.net/defillama/v1/backfill";

type DayRow = {
  date: string;
  volume_usd: number;
  dailyFees: number;
  dailyFeesToAccounts: number;
  dailyFeesBurned: number;
  dailyFeesUnknownDestination: number;
  dailyProtocolFees: number;
};

const fetch = async (options: FetchOptions) => {
  const day = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const rows: DayRow[] = await fetchURL(`${API}?startDate=${day}&endDate=${day}`);
  const row = rows?.find((r) => r.date === day);
  if (!row || row.volume_usd == null || row.dailyFees == null) {
    throw new Error(`Hydration API has no closed-day volume for ${day}`);
  }

  const fees = row.dailyFees;
  const burned = row.dailyFeesBurned;
  const protocolFees = row.dailyProtocolFees;
  const toAccounts = row.dailyFeesToAccounts;
  const unknown = row.dailyFeesUnknownDestination;
  // Protocol fee credited rather than burned: Treasury until 2026-02-16, then the
  // HDX sub-pool hub reserve (protocol-owned liquidity). The burn share is measured
  // per day, so the 2025-02-16 and 2026-02-16 runtime changes need no date switch.
  // https://hydration-api.neckwork.net/openapi.json — dailyProtocolFees
  const protocolCredited = protocolFees - burned;
  // Account credits that are not the protocol fee: LPs, referrers, and HDX stakers.
  // The indexer records the recipient account but not its role, so those shares stay together.
  const accountFees = toAccounts - protocolCredited;
  if (protocolCredited < -0.01 || accountFees < -0.01 || unknown < 0 || burned < 0) {
    throw new Error(`Hydration fee split does not balance for ${day}`);
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyVolume.addUSDValue(row.volume_usd);
  dailyFees.addUSDValue(fees, "Swap Fees");

  dailySupplySideRevenue.addUSDValue(accountFees, "Swap Fees To Accounts");
  // Pre-Broadcast Omnipool asset fees (mostly before 2025). The chain did not record
  // a recipient; they are real fees and are not protocol revenue.
  dailySupplySideRevenue.addUSDValue(unknown, "Omnipool Asset Fees Unknown Destination");

  dailyHoldersRevenue.addUSDValue(burned, "Omnipool Protocol Fees Burned");
  dailyProtocolRevenue.addUSDValue(protocolCredited, "Omnipool Protocol Fees To Treasury");
  dailyRevenue.addUSDValue(burned, "Omnipool Protocol Fees Burned");
  dailyRevenue.addUSDValue(protocolCredited, "Omnipool Protocol Fees To Treasury");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      start: "2024-04-28",
    },
  },

  methodology: {
    Volume: "Single-counted USD trading volume of Hydration swaps. A routed trade counts once, at the larger of its two boundary sides. Money-market wrap round-trips are excluded.",
    Fees: "All swap fees paid on Hydration, valued when the trade happened.",
    Revenue: "Omnipool protocol fees charged in the hub asset. Burned HDX is holder revenue; the rest is kept by the protocol.",
    SupplySideRevenue: "Swap fees credited to accounts other than the protocol fee, plus Omnipool asset fees whose recipient the chain did not record. LP, referrer, and HDX staker shares are not separated.",
    ProtocolRevenue: "Omnipool protocol fees kept by the protocol: the Treasury share until 16 February 2026, and the HDX sub-pool hub reserve (protocol-owned liquidity) since.",
    HoldersRevenue: "Omnipool protocol fees burned. The runtime burned all of them until 16 February 2025, half until 16 February 2026, and none since.",
  },
  breakdownMethodology: {
    Fees: {
      "Swap Fees": "All swap fees paid on Hydration, across Omnipool, XYK, Stableswap, and Uniswap v3 pools.",
    },
    Revenue: {
      "Omnipool Protocol Fees Burned": "Hub-asset protocol fees destroyed by the runtime.",
      "Omnipool Protocol Fees To Treasury": "Hub-asset protocol fees credited to the Treasury or, since 16 February 2026, to protocol-owned liquidity.",
    },
    ProtocolRevenue: {
      "Omnipool Protocol Fees To Treasury": "Hub-asset protocol fees credited to the Treasury or, since 16 February 2026, to protocol-owned liquidity.",
    },
    SupplySideRevenue: {
      "Swap Fees To Accounts": "Swap fees credited to an account that are not the Omnipool protocol fee. Recipients include LPs, referrers, and HDX stakers; the indexer does not record which.",
      "Omnipool Asset Fees Unknown Destination": "Pre-Broadcast Omnipool asset fees whose recipient the chain did not record. Not counted as protocol revenue.",
    },
    HoldersRevenue: {
      "Omnipool Protocol Fees Burned": "Hub-asset protocol fees destroyed by the runtime. All of them until 16 February 2025, half until 16 February 2026, and none since.",
    },
  },
};

export default adapter;
