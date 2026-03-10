import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_TOKENS: Record<string, string[]> = {
  [CHAIN.POLYGON]: [
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
  ],
};

const FEE_TARGETS: Record<string, string[]> = {
  [CHAIN.POLYGON]: [
    "0x04F88Cf97d33F1Ec4659e7976607A64A85F05154",
  ],
};

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const tokens = FEE_TOKENS[chain] || [];
  const targets = FEE_TARGETS[chain] || [];

  if (!tokens.length || !targets.length) {
    return {
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
    };
  }

  const dailyFees = await addTokensReceived({
    options,
    tokens,
    targets,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees:
    "All USDC transferred into the fee wallet during the day is counted as total fees.",
  Revenue:
    "All USDC fees received by the wallet are considered revenue.",
  ProtocolRevenue:
    "All USDC fees received by the wallet are considered protocol revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.POLYGON],
  start: "2026-02-17",
  methodology,
};

export default adapter;
