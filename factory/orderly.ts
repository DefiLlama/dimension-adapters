import { getBuilderExports } from "../helpers/orderly";
import { createFactoryExports } from "./registry";

type Config = {
  broker_id: string;
  start: string;
  methodology?: Record<string, string>;
};

const feesConfigs: Record<string, Config> = {
  "honeypot-finance": {
    broker_id: "honeypot",
    start: "2025-11-01",
    methodology: {
      Fees: "Builder Fees collected from Orderly Network",
      Revenue: "All the fees collected",
      ProtocolRevenue: "All the revenue goes to the protocol",
    },
  },
  "kodiak-perps": { broker_id: "kodiak", start: "2025-10-1" },
  "what-exchange": { broker_id: "what_exchange", start: "2024-06-13" },
  "woofi-pro-perp": { broker_id: "woofi_pro", start: "2023-10-26" },
  "oklong": {
    broker_id: "oklong",
    start: "2025-10-22",
    methodology: {
      Fees: "Trading fees collected from Orderly Network",
      Revenue: "Revenue represents the portion of trading fees accrued to the Oklong broker.",
      ProtocolRevenue: "All the revenue go to the protocol",
    },
  },
  "orderly-broker-coin360": {
    broker_id: "coin360",
    start: "2025-10-13",
    methodology: {
      Volume: "Maker/taker volume that flow through the interface",
      Fees: "Builder Fees collected from Orderly Network",
      Revenue: "All the fees collected",
      ProtocolRevenue: "All the revenue goes to the protocol",
    },
  },
  "raydium-perps": {
    broker_id: "raydium",
    start: "2024-12-11",
    methodology: {
      Fees: "Raydium charges no fee at the moment, there is 3 bps taker fees on orderly",
      Revenue: "No fee, so no revenue",
      ProtocolRevenue: "n/a",
    },
  },
  "toro-perp": {
    broker_id: "toroperp",
    start: "2025-11-01",
    methodology: {
      Fees: "Builder Fees collected from Orderly Network",
      Revenue: "All the fees collected",
      ProtocolRevenue: "All the revenue goes to the protocol",
    },
  },
  "velto": {
    broker_id: "velto",
    start: "2025-11-25",
    methodology: {
      Fees: "Trading fees collected from Orderly Network",
      Revenue: "Revenue represents the portion of trading fees accrued to the Velto broker.",
      ProtocolRevenue: "All the revenue go to the protocol",
    },
  },
};

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = getBuilderExports(config);
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
