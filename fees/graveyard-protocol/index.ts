// Graveyard Protocol - Solana ATA Rent Reclamation Service
// Users can reclaim SOL rent from closed Associated Token Accounts (ATAs)
// Protocol charges 10% service fee on reclaimed rent, 100% goes to treasury

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const FEE_COLLECTOR_WALLET = "GRAVEbqZNUN1K7WBgvwgWUYs69M51eprZbSkeXWbQjjE";

const fetch = async (options: FetchOptions) => {
  const feesCollected = await getSolanaReceived({
    options,
    target: FEE_COLLECTOR_WALLET,
    mints: ["So11111111111111111111111111111111111111112"],
  });
  
  const dailyFees = options.createBalances();
  dailyFees.addBalances(feesCollected, METRIC.SERVICE_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Service fees charged for ATA rent reclamation, calculated as 10% of total SOL rent reclaimed when users close Associated Token Accounts",
  UserFees: "Service fees paid by users for the ATA rent reclamation service, equal to 10% of the SOL rent they reclaim",
  Revenue: "All service fees collected are retained as protocol revenue, as there are no liquidity providers or token holders to distribute to",
  ProtocolRevenue: "100% of service fees flow to the protocol treasury to fund operations and development",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Service fees charged to users for reclaiming SOL rent from closed Associated Token Accounts, calculated as 10% of the total rent amount reclaimed per transaction",
  },
  UserFees: {
    [METRIC.SERVICE_FEES]: "Service fees paid by users for the ATA rent reclamation service, equal to 10% of the SOL rent they reclaim when closing unused token accounts",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "All service fees collected from the rent reclamation service, retained as protocol revenue with no distribution to external parties",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "100% of service fee revenue allocated to the protocol treasury to fund operations, development, and future protocol enhancements",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
