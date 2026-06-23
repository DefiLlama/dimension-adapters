import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// ── PumpBox Contracts on Base Mainnet ──
const CHECKOUT_CONTRACT = "0x64FEeB41A17Dd29b9BAF6d45Ca2d359aE55d8C68";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// ── Event ABI (human-readable, per DefiLlama guidelines) ──
const OPEN_BOX_REQUESTED =
  "event OpenBoxRequested(address indexed user, bytes32 indexed boxId, uint256 indexed requestId, uint32 quantity, uint256 paidAmount, uint256 clientEntropy)";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // Get OpenBoxRequested logs within the current time window
  // (getLogs automatically scopes to the correct fromBlock/toBlock range)
  const logs = await getLogs({
    target: CHECKOUT_CONTRACT,
    eventAbi: OPEN_BOX_REQUESTED,
  });

  // Sum all paidAmount across box-opening requests in this period.
  // paidAmount is in USDC base units (6 decimals).
  for (const log of logs) {
    const paidAmount = log.paidAmount as bigint;
    dailyFees.add(USDC_BASE, paidAmount, METRIC.SERVICE_FEES);
    dailyRevenue.add(USDC_BASE, paidAmount, METRIC.SERVICE_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "All USDC payments made by users when opening blind boxes. Each box has a fixed USDC price; users pay price × quantity.",
  Revenue: "All box-opening payments are retained by the protocol as revenue (no supply-side split).",
  ProtocolRevenue: "Same as Revenue — 100% of box-opening fees go to the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]:
      "USDC paid by users to request blind box openings. The checkout contract escrows USDC and transfers it to the payment receiver upon fulfillment.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]:
      "100% of box-opening fees retained by the protocol. PumpBox does not split fees with LPs or creators.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]:
      "100% of Revenue is protocol revenue, transferred to the treasury address after box fulfillment.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-10-15", // Contract deployment on Base mainnet (~block 46750378)
  methodology,
  breakdownMethodology,
};

export default adapter;
