import { polymarketBuilderExports, polymarketV2BuilderFeesExports } from "../helpers/polymarket";
import { createFactoryExports } from "./registry";

// builderCode values sourced from https://data-api.polymarket.com/v1/builders/volume
// (each row includes builder + builderCode). The 6 codes that also appear in feesConfigs
// below match that dump. PolyHelper.io is absent from the dump, so it has no builderCode
// and keeps its previous notional-only behavior.
const dexsConfigs: Record<string, { builder: string; start: string; builderCode?: string }> = {
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
  "polyhelper-io": { builder: "PolyHelper.io", start: "2026-01-01" },
  "gate": { builder: "Gate", start: "2026-02-14", builderCode: "0x2c6624a23b16a2a69acd14c87b7fc03906870c851fa0a7b7f9d7be0fbbedea8a" },
  "polycop": { builder: "PolyCop", start: "2025-12-01", builderCode: "0x4898df15ec6590495dc6c0fedf951ade3e64001d47f9caf44a64e86fc11959df" },
  "traderline": { builder: "traderline", start: "2025-12-01", builderCode: "0x6b0e773fada0a2ec67c956b25a737d353a534ea33db56c717ba7854346c67984" },
  "metamask": { builder: "MetaMask", start: "2025-11-10", builderCode: "0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883" },
  "wager-up-pilot": { builder: "WagerUpPilot", start: "2026-04-07", builderCode: "0xbc37cc54237a06aa0d380814fadf2f5b6d20483300833f381e4727f1066845fb" },
  "yeno": { builder: "yeno-markets", start: "2026-06-26", builderCode: "0x5bffd61a6dbfca06f19a543cac4b9e433378ac9992d70b8a40824720e353498f" },
};

const feesConfigs: Record<string, { builderName: string; builderCode: string; start: string }> = {
  "polygun": { builderName: "Polygun", builderCode: "0xd625c78659cda77fc5e1b2c2657ec4ecc9187ec82fbc4a2300337269332c046b", start: "2026-04-28" },
  "bullpen": { builderName: "Bullpen", builderCode: "0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de", start: "2026-04-21" },
  "evplusai": { builderName: "EvplusAI", builderCode: "0xb8d6bf0c9ec3c806c30fcb0e8da931f2940a5141cf420394c4b1d82ae7c6d415", start: "2026-04-28" },
  "preddy-trade": { builderName: "Preddy.trade", builderCode: "0x25d56a25be81b183908e80ccc522e72d4187480a4aa29fa7e4dd1112546fabef", start: "2026-04-28" },
  "polytrader-app": { builderName: "Polytrader.app", builderCode: "0x6f5dfb79b61e701021143a9426b4188bda94da794068dec5454a0ac2ec82bc64", start: "2026-04-28" },
  "kiyotaka": { builderName: "Kiyotaka", builderCode: "0x2096c1dd5e4d0c660ce764ab20a3a95853d11e27724b3c73cad543352da1555f", start: "2026-04-28" },
  "metamask-predictions": { builderName: "MetaMask", builderCode: "0x11a22276beb720e66a072cba8b8e74cded60afda510af535b947b81a1b81a883", start: "2026-04-28" },
  "based-predict": { builderName: "Based", builderCode: "0x07aa1a8523160e8e9c2d07ac890d56d21c3fe0f11292558f941f69624788d1cf", start: "2026-04-28" },
  "traderline": { builderName: "traderline", builderCode: "0x6b0e773fada0a2ec67c956b25a737d353a534ea33db56c717ba7854346c67984", start: "2026-04-28" },
  "yeno": { builderName: "yeno-markets", builderCode: "0x5bffd61a6dbfca06f19a543cac4b9e433378ac9992d70b8a40824720e353498f", start: "2026-06-26" },
}

const dexsProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = polymarketBuilderExports(config);
}

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = polymarketV2BuilderFeesExports(config);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
export const fees = createFactoryExports(feesProtocols);
