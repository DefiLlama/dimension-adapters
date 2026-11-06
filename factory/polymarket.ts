import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPolymarketVolume, polymarketBuilderExports, polymarketV2BuilderFeesExports } from "../helpers/polymarket";
import { createFactoryExports } from "./registry";

// builderCode values sourced from https://data-api.polymarket.com/v1/builders/volume
// (each row includes builder + builderCode). The 6 codes that also appear in feesConfigs
// below match that dump. PolyHelper.io's code is from the `builder_code` field of
// https://data-api.polymarket.com/v2/builders/volume (the same code on every row).
const dexsConfigs: Record<string, { builder: string; start: string; builderCode: string }> = {
  "based-predict": { builder: "Based", start: "2025-11-18", builderCode: "0x07aa1a8523160e8e9c2d07ac890d56d21c3fe0f11292558f941f69624788d1cf" },
  "betmoar-fun": { builder: "betmoar", start: "2025-10-17", builderCode: "0xceebf77a833b30520287ddd9478ff51abbdffa30aa90a8d655dba0e8a79ce0c1" },
  "flowbot-prediction": { builder: "FlowBot", start: "2025-12-31", builderCode: "0x18fc17ee71e267387694d721f09ccb2517cb2092acee07449dc896b58367dbb5" },
  "frenflow": { builder: "FrenFlow", start: "2026-02-16", builderCode: "0x1a907452bfffcc46534332a0882c2fb78e289fec946ea88f603f5767e080fcd5" },
  "polycule": { builder: "Polycule", start: "2025-11-03", builderCode: "0xb687940cdede3d6e24b115affb282228515a5bf2ffa7b65269e2dfb5ea745e96" },
  "polytraderpro": { builder: "polytraderpro", start: "2025-10-22", builderCode: "0x29f8d1998cd4186678d0085cd54072aeefd05bc476ef1844361510d857ac074b" },
  "stand-trade": { builder: "standtrade", start: "2025-10-10", builderCode: "0x13600b294191fc92924bb3ce4b969c1e7e2bab8f4c93c3fc6d0a51733df3c060" },
  "rainbow-predictions": { builder: "Rainbow", start: "2025-11-12", builderCode: "0xabce5abdc189cba6fb85edb9170e3e6e41607e946b06d112b7f87e2f2977020c" },
  "kreo": { builder: "Kreo", start: "2026-01-09", builderCode: "0x9fedc0b0702ca6cb294e5321d9491b1e38b8bd2b463a7f7b06df8e6d7553cd18" },
  "polygun": { builder: "Polygun", start: "2025-11-27", builderCode: "0xd625c78659cda77fc5e1b2c2657ec4ecc9187ec82fbc4a2300337269332c046b" },
  "bullpen": { builder: "Bullpen", start: "2025-10-14", builderCode: "0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de" },
  "evplusai": { builder: "EVplusAI", start: "2026-02-26", builderCode: "0xb8d6bf0c9ec3c806c30fcb0e8da931f2940a5141cf420394c4b1d82ae7c6d415" },
  "preddy-trade": { builder: "Preddy.trade", start: "2025-11-07", builderCode: "0x25d56a25be81b183908e80ccc522e72d4187480a4aa29fa7e4dd1112546fabef" },
  "polytrader-app": { builder: "Polytrader.app", start: "2025-12-31", builderCode: "0x6f5dfb79b61e701021143a9426b4188bda94da794068dec5454a0ac2ec82bc64" },
  "kiyotaka": { builder: "Kiyotaka", start: "2025-12-09", builderCode: "0x2096c1dd5e4d0c660ce764ab20a3a95853d11e27724b3c73cad543352da1555f" },
  "polyhelper-io": { builder: "PolyHelper.io", start: "2026-01-01", builderCode: "0xb05677aa676cd5aeab7e8d85ef83836ee1bf4e3de5519d5bbb6594484b51a805" },
  "gate": { builder: "Gate", start: "2026-02-14", builderCode: "0x2c6624a23b16a2a69acd14c87b7fc03906870c851fa0a7b7f9d7be0fbbedea8a" },
  "polycop": { builder: "PolyCop", start: "2025-12-01", builderCode: "0x4898df15ec6590495dc6c0fedf951ade3e64001d47f9caf44a64e86fc11959df" },
  "traderline": { builder: "traderline", start: "2025-12-01", builderCode: "0x6b0e773fada0a2ec67c956b25a737d353a534ea33db56c717ba7854346c67984" },
  "metamask": { builder: "MetaMask", start: "2025-11-10", builderCode: "0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883" },
  "wager-up-pilot": { builder: "WagerUpPilot", start: "2026-04-07", builderCode: "0xbc37cc54237a06aa0d380814fadf2f5b6d20483300833f381e4727f1066845fb" },
  "yeno": { builder: "yeno-markets", start: "2026-06-26", builderCode: "0x5bffd61a6dbfca06f19a543cac4b9e433378ac9992d70b8a40824720e353498f" },
  "smartx": { builder: "SmartX", start: "2026-02-27", builderCode: "0x58d3820045831c879b218ec64514dc191eebadf31a4641670293fddf542643c3" },
  "virae": { builder: "Virae.ai", start: "2026-05-02", builderCode: "0xcb5f0c1b63c47ad9193a5d1a95a2055076eec604be4abb019025dd0e3554a7cc" },
  "overdog": { builder: "OVERDOG", start: "2026-03-27", builderCode: "0x21d90db23c70a5901c0ee20f0ee20cf7f98fce24795a4e99cbf79cf0d8d63905" },
  "cro-trade-predict": { builder: "crotrade", start: "2026-06-03", builderCode: "0x6b82257805a4732cbd432c88ff1c5137ce4038f82145ed6c67b5588b742f2ee4" },
  "whalidate": { builder: "Whalidate", start: "2026-10-01", builderCode: "0x7043f01555796d800d711fd807cbb367bd260d85ba45b052ac472b1e049d596f" },
  "onagi-predict": { builder: "onagi", start: "2026-10-22", builderCode: "0x2ce40875d56e3e37d1ec456cedb0d252d611fd7afea48497b6d323729e6a0f7f" },
  "blackboard-predict": { builder: "Blackboard", start: "2026-04-29", builderCode: "0x9bbe9aa6257b0e4ff355d037e3f018b72789ae765b92c5a681c7afea303b9a7c" },
  "wallet-v-predictions": { builder: "Wallet V", start: "2026-09-09", builderCode: "0x569d18dd9e5cc8758e66ed53f6ad41172997cd10317f4e07d67fe4e3ac6a2a04" },
  // Sparkling (https://sparkl.ing): builder name and code as listed in https://data-api.polymarket.com/v2/builders/volume
  // and set in the public code of https://app.sparkl.ing; first attributed trade 2026-09-13
  "sparkling-predict": { builder: "Sparkling", start: "2026-09-13", builderCode: "0xc31925c98db2b5eef3e1516f67115e3220a65b13c21eabd5e6244f997d08827a" },
};

const feesConfigs: Record<string, { builderName: string; builderCode: string; start: string; revenueToHolders?: boolean; holdersRevenueRatio?: number; supplySideRevenueRatio?: number }> = {
  "polygun": { builderName: "Polygun", builderCode: "0xd625c78659cda77fc5e1b2c2657ec4ecc9187ec82fbc4a2300337269332c046b", start: "2026-04-28" },
  "bullpen": { builderName: "Bullpen", builderCode: "0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de", start: "2026-04-21" },
  "evplusai": { builderName: "EvplusAI", builderCode: "0xb8d6bf0c9ec3c806c30fcb0e8da931f2940a5141cf420394c4b1d82ae7c6d415", start: "2026-04-28" },
  "preddy-trade": { builderName: "Preddy.trade", builderCode: "0x25d56a25be81b183908e80ccc522e72d4187480a4aa29fa7e4dd1112546fabef", start: "2026-04-28" },
  "polytrader-app": { builderName: "Polytrader.app", builderCode: "0x6f5dfb79b61e701021143a9426b4188bda94da794068dec5454a0ac2ec82bc64", start: "2026-04-28" },
  "kiyotaka": { builderName: "Kiyotaka", builderCode: "0x2096c1dd5e4d0c660ce764ab20a3a95853d11e27724b3c73cad543352da1555f", start: "2026-04-28" },
  // MetaMask's 4% builder fee is 3% MetaMask + 1% provider: predictFeeCollection.metamaskFee 0.03, providerFee 0.01 in
  // https://client-config.api.cx.metamask.io/v1/flags?client=mobile&distribution=main&environment=prod
  // Polymarket is the provider: https://support.metamask.io/trade/predict/how-to-trade-predictions/
  "metamask-predictions": { builderName: "MetaMask", builderCode: "0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883", start: "2026-04-28", supplySideRevenueRatio: 0.25 },
  "based-predict": { builderName: "Based", builderCode: "0x07aa1a8523160e8e9c2d07ac890d56d21c3fe0f11292558f941f69624788d1cf", start: "2026-04-28" },
  "traderline": { builderName: "traderline", builderCode: "0x6b0e773fada0a2ec67c956b25a737d353a534ea33db56c717ba7854346c67984", start: "2026-04-28" },
  "yeno": { builderName: "yeno-markets", builderCode: "0x5bffd61a6dbfca06f19a543cac4b9e433378ac9992d70b8a40824720e353498f", start: "2026-06-26" },
  "smartx": { builderName: "SmartX", builderCode: "0x58d3820045831c879b218ec64514dc191eebadf31a4641670293fddf542643c3", start: "2026-04-28" },
  "virae": { builderName: "Virae.ai", builderCode: "0xcb5f0c1b63c47ad9193a5d1a95a2055076eec604be4abb019025dd0e3554a7cc", start: "2026-04-28" },
  "cro-trade-predict": { builderName: "crotrade", builderCode: "0x6b82257805a4732cbd432c88ff1c5137ce4038f82145ed6c67b5588b742f2ee4", start: "2026-06-03", revenueToHolders: true },
  // Onagi pools these with its other fees (fees/onagi.ts, dexs/onagi-perps.ts) and splits all of it the same way:
  // 50% USDG payouts to ONAGI holders + 25% ONAGI buyback and burn, 25% treasury (split.*Bps in https://onagi.si/data/cycles.json)
  "onagi-predict": { builderName: "Onagi", builderCode: "0x2ce40875d56e3e37d1ec456cedb0d252d611fd7afea48497b6d323729e6a0f7f", start: "2026-10-22", holdersRevenueRatio: 0.75 },
  "blackboard-predict": { builderName: "Blackboard", builderCode: "0x9bbe9aa6257b0e4ff355d037e3f018b72789ae765b92c5a681c7afea303b9a7c", start: "2026-04-29" },
  "wallet-v-predictions": { builderName: "Wallet V", builderCode: "0x569d18dd9e5cc8758e66ed53f6ad41172997cd10317f4e07d67fe4e3ac6a2a04", start: "2026-09-09" },
  // first trade with a builder fee in https://clob.polymarket.com/builder/trades for this code: 2026-09-13
  "sparkling-predict": { builderName: "Sparkling", builderCode: "0xc31925c98db2b5eef3e1516f67115e3220a65b13c21eabd5e6244f997d08827a", start: "2026-09-13" },
}

// Polymarket-style CTF exchanges on other chains: OrderFilled logs of the listed exchange contracts, the collateral
// (asset id 0) leg of each fill halved for the maker + taker double count, as in the Polymarket methodology.
type CtfExchangeConfig = {
  chain: CHAIN;
  exchanges: string[];
  currency: string; // the exchange collateral, or the priced token it is 1:1 with
  start: string;
  methodology?: Record<string, string>;
  extraReturnFields?: Record<string, any>;
};

const ctfExchangeMethodology = {
  Volume: "Trading volume from OrderFilled events on the CTF exchanges. Only the collateral side of each fill is counted and amounts are halved to correct for the maker + taker double counting, matching the Polymarket methodology.",
  NotionalVolume: "Notional volume (1 collateral unit = 1 outcome token) traded through OrderFilled events on the CTF exchanges.",
};

const ctfExchangeConfigs: Record<string, CtfExchangeConfig> = {
  "hermes-trade": {
    // Hermes Trade - Polymarket-style prediction market CLOB on Monad: CTFExchange (regular / sports) and NegRiskCtfExchange.
    // The exchange collateral (assetId 0) is USDW (0xb7bD080Df56FA76ce6CA4fA737d47815f7F8e746), a $1 receipt token 1:1 with
    // USDC that shares USDC's 6 decimals. USDW is not priced by DefiLlama, so the collateral-side fills are valued with the priced USDC feed.
    chain: CHAIN.MONAD, start: "2026-05-18", currency: ADDRESSES.monad.USDC,
    exchanges: ["0x017641abFa4264121237023f9Fe678BF00F60De8", "0x50b7B00EE75F8bFb5cDa892883aFb3867851c738"],
    methodology: {
      Volume: "Trading volume from OrderFilled events on the Hermes Trade CLOB exchanges (regular + NegRisk). Only the collateral (USDW, valued as USDC) side of each fill is counted and amounts are halved to correct for the maker + taker double counting, matching the Polymarket methodology.",
    },
  },
  "pred": {
    // https://pred-1.gitbook.io/pred-docs, https://github.com/orgs/pred-org/repositories
    chain: CHAIN.BASE, start: "2026-02-05", currency: ADDRESSES.base.USDC,
    exchanges: [
      "0x03C6c6fbdc0c719Dc878fCe24deBaBC31B2B4a27", // CTF_EXCHANGE
      "0x90B036c618196634200F0323c420C50CdBBCf07C", // NEG_RISK_CTF_EXCHANGE
      "0xd3460060A8363C24babC411a11444d5d985342EF", // CROSS_MATCHING_ADAPTER
      "0x3d6726aF35Ae695E056e6e2ebDB5c813b7d8B6CC", // NEG_RISK_CTF_EXCHANGE_LEGACY
      "0x74AD4708928628c20608F10751EaFBE391197b0F", // CROSS_MATCHING_ADAPTER_LEGACY
      "0xcc9D4EA7c86f2d6d67a44BC5e7A8932699ddDDa1", // NEG_RISK_CTF_EXCHANGE_LEGACY_V2
      "0x7B39c530C3F2Ea4056f1a3bBa777F82bBDFB047A", // CROSS_MATCHING_ADAPTER_LEGACY_V2
      "0x1938Af63B717B80ea62ccB4CCBf799F8a28dEFB0", // NEG_RISK_CTF_EXCHANGE_LEGACY_V3
      "0xC574A05e622A769e6aB14293070cDF6cADB55F98", // CROSS_MATCHING_ADAPTER_LEGACY_V3
    ],
  },
  "predict-fun": {
    chain: CHAIN.BSC, start: "2025-11-22", currency: ADDRESSES.bsc.USDT,
    exchanges: [
      '0x6bEb5a40C032AFc305961162d8204CDA16DECFa5', // CTFExchange - Yield Bearing
      '0x8A289d458f5a134bA40015085A8F50Ffb681B41d', // NegRiskCtfExchange - Yield Bearing
      '0x8BC070BEdAB741406F4B1Eb65A72bee27894B689', // CTFExchange - Non Yield
      '0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A', // NegRiskCtfExchange - Non Yield
    ],
  },
  "probable": {
    chain: CHAIN.BSC, start: "2025-12-09", currency: ADDRESSES.bsc.USDT,
    exchanges: ["0xf99f5367ce708c66f0860b77b4331301a5597c86"],
    extraReturnFields: { dailyFees: 0 }, // no fees
  },
  "prophet-market": {
    // Prophet Market is an on-chain prediction market on Polygon where outcomes are settled through AI-powered resolution.
    // Each trade settles through an OrderFilled event on the ProphetCTFExchange (deployed at block 86244025), where one leg
    // is native USDC collateral (asset id 0) and the other is an ERC-1155 outcome token (a non-zero id).
    chain: CHAIN.POLYGON, start: "2026-05-01", currency: ADDRESSES.polygon.USDC_CIRCLE,
    exchanges: ["0x127aD3A6e55EbBDaecC0eaeb12615879611e1839"],
    methodology: {
      Volume: "USDC volume traded through OrderFilled events on Prophet's CTF exchange. Only the collateral (USDC) side of each fill is counted and amounts are halved to correct for maker + taker double counting, matching the Polymarket methodology.",
      NotionalVolume: "Notional volume (1 USDC = 1 outcome token) traded through OrderFilled events on Prophet's CTF exchange.",
    },
  },
};

function ctfExchangeExports({ chain, exchanges, currency, start, methodology, extraReturnFields }: CtfExchangeConfig): SimpleAdapter {
  return {
    version: 2,
    pullHourly: true,
    chains: [chain],
    start,
    methodology: { ...ctfExchangeMethodology, ...methodology },
    fetch: async (options: FetchOptions) => {
      const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({ options, exchanges, currency });
      return { dailyVolume, dailyNotionalVolume, ...(extraReturnFields ?? {}) };
    },
  };
}

const dexsProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = polymarketBuilderExports(config);
}
for (const [name, config] of Object.entries(ctfExchangeConfigs)) {
  dexsProtocols[name] = ctfExchangeExports(config);
}

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = polymarketV2BuilderFeesExports(config);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
export const fees = createFactoryExports(feesProtocols);
