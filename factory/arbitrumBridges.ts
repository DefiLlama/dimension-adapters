import { ArbitrumBridgeConfig, arbitrumBridgeExport } from "../helpers/arbitrumBridge";
import { createFactoryExports } from "./registry";

/**
 * Canonical bridges of Arbitrum-stack chains, Ethereum side. One-sided: each listing's destination chain is attributed
 * server-side. See helpers/arbitrumBridge.ts.
 */
const configs: Record<string, ArbitrumBridgeConfig> = {
  // https://docs.arbitrum.io/build-decentralized-apps/reference/contract-addresses
  "arbitrum-bridge": {
    name: "Arbitrum One",
    inbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
    bridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a",
    escrows: [
      "0xa3A7B6F88361F48403514059F1F16C8E78d60EeC", // L1 ERC20 gateway
      "0xcEe284F754E854890e311e3280b767F80797180d", // L1 custom gateway
      "0xd92023E9d9911199a6711321D1277285e6d4e2db", // L1 WETH gateway
      "0xA10c7CE4b876998858b1a9E12b10092229539400", // DAI L1 escrow
    ],
    wethGatewayAlias: "0xea3123e9d9911199a6711321d1277285e6d4f3ec", // alias of 0xd92023E9d9911199a6711321D1277285e6d4e2db
    start: "2022-10-17", // first day the old bridges server recorded Arbitrum volume
  },
  // https://docs.robinhood.com/chain/protocol-contracts/
  "robinhood-bridge": {
    name: "Robinhood Chain",
    inbox: "0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D",
    bridge: "0xDf8755334ce7A73cCF6b581C02eA649AE3E864b3",
    escrows: [
      "0x85001CC4867C5e1C22dA4B79BB8852B9e2a06da0", // L1 ERC20 gateway
      "0x9368EAEbFe6E063C69dcF8126711A6997E0eCeE1", // L1 custom gateway
      "0xF7e12b9614b509C747ab4423bC4ACF923759Cf1B", // L1 WETH gateway
    ],
    wethGatewayAlias: "0x08f22b9614b509c747ab4423bc4acf923759e02c", // alias of 0xF7e12b9614b509C747ab4423bC4ACF923759Cf1B
    start: "2026-07-07", // first day the old bridges server recorded Robinhood volume
  },
};

const protocols: Record<string, any> = {};
for (const [slug, config] of Object.entries(configs)) protocols[slug] = arbitrumBridgeExport(config);

export const { protocolList, getAdapter } = createFactoryExports(protocols);
