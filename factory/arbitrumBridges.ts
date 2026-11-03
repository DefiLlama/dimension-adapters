import { ArbitrumBridgeConfig, arbitrumBridgeExport } from "../helpers/arbitrumBridge";
import { CHAIN } from "../helpers/chains";
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
    excludedTokens: [
      // DPX on Ethereum: 400M deposited on 2026-04-15 against a real DPX supply of ~500k (Ethereum supply is now 400.5M, freshly minted), priced at the Arbitrum DPX price
      "0xEec2bE5c91ae7f8a338e1e5f3b5DE49d07AfdC81",
    ],
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
  "arbitrum-nova-bridge": {
    name: "Arbitrum Nova",
    inbox: "0xc4448b71118c9071Bcb9734A0EAc55D18A153949",
    bridge: "0xC1Ebd02f738644983b6C4B2d440b8e77DdE276Bd",
    escrows: [
      "0xB2535b988dcE19f9D71dfB22dB6da744aCac21bf", // L1 ERC20 gateway
      "0x23122da8C581AA7E0d07A36Ff1f16F799650232f", // L1 custom gateway
      "0xE4E2121b479017955Be0b175305B35f312330BaE", // L1 WETH gateway
      "0xA2e996f0cb33575FA0E36e8f62fCd4a9b897aAd3", // DAI L1 escrow
    ],
    wethGatewayAlias: "0xf5f3121b479017955be0b175305b35f312331cbf", // alias of 0xE4E2121b479017955Be0b175305B35f312330BaE
    start: "2022-06-24",
  },
  "sx-rollup-bridge": {
    name: "SX Rollup",
    inbox: "0xEa83E8907C89Bc0D9517632f0ba081972E328631",
    bridge: "0xa104C0426e95a5538e89131DbB4163d230C35f86",
    escrows: ["0xB4968C66BECc8fb4f73b50354301c1aDb2Abaa91"], // L1 ERC20 gateway (router default)
    nativeToken: "0xbe9F61555F50DD6167f2772e9CF7519790d96624", // SX
    start: "2024-07-05",
  },
  "gravity-galxe-bridge": {
    name: "Gravity",
    inbox: "0x7AD2a94BefF3294a31894cFb5ba4206957a53c19",
    bridge: "0x7983403dDA368AA7d67145a9b81c5c517F364c42",
    escrows: ["0xb23988D9728EF147EAa02D602D7e067B6131A1bB"], // L1 ERC20 gateway (router default)
    nativeToken: "0x9C7BEBa8F6eF6643aBd725e45a4E8387eF260649", // G
    start: "2024-05-18",
  },
  "pepu-bridge": {
    name: "Pepe Unchained",
    inbox: "0xE92Df19F4e0Fd067FE3b788Cf03ffD06Cd9Be4A7",
    bridge: "0xd3643255ea784c75a5325cc5a4a549c7cd62e499",
    escrows: ["0x7c2838461fa468896a06CA1e7d88BDeCE1f2e1bE"], // L1 ERC20 gateway (router default)
    nativeToken: "0x93aA0ccD1e5628d3A841C4DbdF602D9eb04085d6", // PEPU
    start: "2025-06-02",
  },
  "degen-bridge": {
    name: "Degen Chain",
    inbox: "0x21A1e2BFC61F30F2E81E0b08cd37c1FC7ef776E7",
    bridge: "0xEfEf4558802bF373Ce3307189C79a9cAb0a4Cb9C",
    escrows: ["0xBeeC380b80c1679Cdc73805a1F809c8DcE31C680"], // ERC20 gateway (router default)
    nativeToken: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", // DEGEN
    parent: { chain: CHAIN.BASE, name: "Base" },
    start: "2024-03-10",
  },
  "sanko-bridge": {
    name: "Sanko",
    inbox: "0x718E2a83775343d5c0B1eE0676703cBAF30CaFCD",
    bridge: "0x2f285781B8d58678a3483de52D618198E4d27532",
    escrows: ["0xb4951c0C41CFceB0D195A95FE66280457A80a990"], // ERC20 gateway (router default)
    nativeToken: "0x8B0E6f19Ee57089F7649A455D89D7bC6314D04e8", // DMT
    parent: { chain: CHAIN.ARBITRUM, name: "Arbitrum" },
    start: "2024-04-12",
  },
};

const protocols: Record<string, any> = {};
for (const [slug, config] of Object.entries(configs)) protocols[slug] = arbitrumBridgeExport(config);

export const { protocolList, getAdapter } = createFactoryExports(protocols);
