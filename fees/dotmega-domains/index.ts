import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";

// https://github.com/0xBreadguy/mega-names#contracts
const MEGA_NAMES = "0x5B424C6CCba77b32b9625a6fd5A30D409d20d997";

const fetch = async (options: FetchOptions) => {
  const feeRecipient = await options.api.call({
    target: MEGA_NAMES,
    abi: "function feeRecipient() view returns (address)",
  });

  const received = await addTokensReceived({
    options,
    token: ADDRESSES.megaeth.USDm,
    target: feeRecipient,
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addBalances(received, "Domain Registration Fees");
  dailyRevenue.addBalances(received, "Domain Registration Fees To Protocol");
  dailyProtocolRevenue.addBalances(received, "Domain Registration Fees To Protocol");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Includes all domain registration fees paid by Dotmega Domains users.",
  Revenue: "Revenue is domain registration fees retained by Dotmega Domains.",
  ProtocolRevenue: "Protocol revenue is domain registration fees retained by Dotmega Domains.",
};

const breakdownMethodology = {
  Fees: {
    "Domain Registration Fees": "Domain registration fees paid by Dotmega Domains users in USDm.",
  },
  Revenue: {
    "Domain Registration Fees To Protocol": "Domain registration fees retained by protocol.",
  },
  ProtocolRevenue: {
    "Domain Registration Fees To Protocol": "Domain registration fees retained by protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-14",
  methodology,
  breakdownMethodology,
};

export default adapter;
