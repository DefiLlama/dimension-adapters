import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived } from "../helpers/token";

const chainConfig: Record<string, { start: string; contract: string }> = {
  [CHAIN.ETHEREUM]: {
    // Source: official Wei Names docs; contract creation timestamp 2026-02-01 07:07:23 UTC.
    start: "2026-02-01",
    contract: "0x0000000000696760e15f265e828db644a0c242eb",
  },
};

const fetch = async (options: FetchOptions) => {
  const { contract } = chainConfig[options.chain];
  const received = await getETHReceived({ options, target: contract });
  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, "Registration & Renewal Fees");

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Wei Name Service name registration and renewal costs.",
  Revenue: "Wei Name Service name registration and renewal costs.",
  ProtocolRevenue: "Wei Name Service name registration and renewal costs.",
};

const breakdownMethodology = {
  Fees: {
    "Registration & Renewal Fees": "Fees paid for .wei name registrations and renewals.",
  },
  Revenue: {
    "Registration & Renewal Fees": "Fees paid for .wei name registrations and renewals.",
  },
  ProtocolRevenue: {
    "Registration & Renewal Fees": "Fees paid for .wei name registrations and renewals.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
