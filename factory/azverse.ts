import { azverseBrokerFeesExports, azverseBrokerVolumeExports } from "../helpers/azverse";
import { createFactoryExports } from "./registry";

// broker_id values are returned by https://app.azverse.xyz/exapi/stats/v1/stats/public/defillama/brokers
const brokerConfigs = {
  "xox-perps": { brokerId: "XOX", brokerName: "XOX", start: "2025-12-11" },
};

const dexsProtocols = Object.fromEntries(
  Object.entries(brokerConfigs).map(([slug, config]) => [slug, azverseBrokerVolumeExports(config)]),
);
const feesProtocols = Object.fromEntries(
  Object.entries(brokerConfigs).map(([slug, config]) => [slug, azverseBrokerFeesExports(config)]),
);

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
export const fees = createFactoryExports(feesProtocols);
