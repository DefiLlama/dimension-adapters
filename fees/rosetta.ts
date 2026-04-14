import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getEVMTokenTransfers } from "../helpers/token";

const FEE_RATE = 0.000001; // 0.0001% - https://docs.rosetta.sh/fees
// can also track inflows to the fee wallet here 0x7fE1c00C60983aFEdb2af31abC74bC7d84CC714c

const ROUTERS: Record<string, string[]> = {
  [CHAIN.HYPERLIQUID]: [
    "0x4f4b787008b855050eddb1157f919e42a78e76fe",
    "0xaf49b5164832dfd3501fb8b56c9ecd1e548d730e",
    "0xCCFBabC026B7e80747704aDFC16779cd38086745",
  ],
  [CHAIN.BASE]: [
    "0xAf49B5164832Dfd3501fB8B56c9EcD1e548D730E",
  ],
};

const fetch = async (options: FetchOptions) => {
  const routers = ROUTERS[options.chain] || [];

  const volume = await getEVMTokenTransfers({
    options,
    fromAddresses: routers,
  });

  const dailyFees = volume.clone(FEE_RATE, METRIC.SERVICE_FEES);

  return {
    dailyVolume: volume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: { start: "2025-12-09" },
    [CHAIN.BASE]: { start: "2026-03-01" },
  },
  methodology: {
    Fees: "0.0001% routing fee on routed volume",
    Revenue: "0.0001% routing fee on routed volume",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SERVICE_FEES]: "0.0001% routing fee charged on all routed volume through Rosetta vaults.",
    },
    Revenue: {
      [METRIC.SERVICE_FEES]: "0.0001% routing fee charged on all routed volume through Rosetta vaults.",
    },
  },
};

export default adapter;
