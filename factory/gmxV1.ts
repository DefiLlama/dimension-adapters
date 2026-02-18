import { gmxV1Exports } from "../helpers/gmx";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

const ktxMethodology = {
  Fees: "Fees from open/close position (based on token utilization, capped at 0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees: "Fees from open/close position (based on token utilization, capped at 0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees goes to KTC stakers",
  SupplySideRevenue: "70% of all collected fees goes to KLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to KTC stakers",
  ProtocolRevenue: "Treasury has no revenue",
};

const feesConfigs: Record<string, any> = {
  "alpacafinance-gmx": {
    [CHAIN.BSC]: { vault: "0x18A15bF2Aa1E514dc660Cc4B08d05f9f6f0FdC4e", start: "2023-03-03" },
  },
  "kinetix-v1": {
    [CHAIN.KAVA]: { vault: "0xa721f9f61CECf902B2BCBDDbd83E71c191dEcd8b", start: "2023-12-12" },
  },
  "ktx": {
    [CHAIN.ARBITRUM]: { vault: "0xc657A1440d266dD21ec3c299A8B9098065f663Bb", start: "2024-01-14", ProtocolRevenue: 0, SupplySideRevenue: 70, HoldersRevenue: 30, methodology: ktxMethodology },
    [CHAIN.BSC]: { vault: "0xd98b46C6c4D3DBc6a9Cc965F385BDDDf7a660856", start: "2023-04-30", methodology: ktxMethodology, ProtocolRevenue: 0, SupplySideRevenue: 70, HoldersRevenue: 30 },
    [CHAIN.MANTLE]: { vault: "0x2e488D7ED78171793FA91fAd5352Be423A50Dae1", start: "2023-09-04", methodology: ktxMethodology, ProtocolRevenue: 0, SupplySideRevenue: 70, HoldersRevenue: 30 },
  },
  "phame-protocol": {
    [CHAIN.PULSECHAIN]: { vault: "0x3dC4033fF5c04FdE3369937434961ca47AC7cA26", start: "2023-09-16" },
  },
  "sobax-io": {
    [CHAIN.POLYGON]: { vault: "0x0e1D69B5888a0411Fe0A05a5A4d2ACED4305f67c", start: "2023-06-26" },
  },
  "tsunami-fi": {
    [CHAIN.MANTLE]: { vault: "0x73a540Bec4350cD2bB3b9e09EBB6976a3C562c55", start: "2023-12-12" },
  },
  "loxodrome-perp": {
    [CHAIN.IOTEX]: { vault: "0x13904291B7d3e87d23070d22Bc34FA514F99Db18", start: "2024-11-02" },
  },
};


const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(feesConfigs)) {
  feesProtocols[name] = gmxV1Exports(config);
}


export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
