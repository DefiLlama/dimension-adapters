import { compoundV2Export } from "../helpers/compoundV2";
import { createFactoryExports } from "./registry";

type Config = {
  comptrollers: Record<string, string>;
  options?: Record<string, any>;
};

const feesConfigs: Record<string, Config> = {
  "benqi-lending": {
    comptrollers: { avax: "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4" },
    options: { holdersRevenueRatio: 0, protocolRevenueRatio: 1 },
  },
  "canto-lending": {
    comptrollers: { canto: "0x5E23dC409Fc2F832f83CEc191E245A191a4bCc5C" },
    options: { protocolRevenueRatio: 1 },
  },
  "capyfi": {
    comptrollers: { ethereum: "0x0b9af1fd73885aD52680A1aeAa7A3f17AC702afA", wc: "0x589d63300976759a0fc74ea6fA7D951f581252D7" },
    options: { protocolRevenueRatio: 1, blacklists: ["0xbaa6bc4e24686d710b9318b49b0bb16ec7c46bfa"] },
  },
  "deepr-finance": {
    comptrollers: { shimmer_evm: "0xF7E452A8685D57083Edf4e4CC8064EcDcF71D7B7", iotaevm: "0xee07121d97FDEA35675e02017837a7a43aeDa48F" },
    options: { holdersRevenueRatio: 1 },
  },
  "elara": {
    comptrollers: { zircuit: "0x695aCEf58D1a10Cf13CBb4bbB2dfB7eDDd89B296" },
    options: { protocolRevenueRatio: 1 },
  },
  "fluxfinance": {
    comptrollers: { ethereum: "0x95Af143a021DF745bc78e845b54591C53a8B3A51" },
    options: { protocolRevenueRatio: 1 },
  },
  "hover": {
    comptrollers: { kava: "0x3A4Ec955a18eF6eB33025599505E7d404a4d59eC" },
  },
  "machfi": {
    comptrollers: { sonic: "0x646F91AbD5Ab94B76d1F9C5D9490A2f6DDf25730" },
    options: { protocolRevenueRatio: 1 },
  },
  "mendi-finance": {
    comptrollers: { linea: "0x1b4d3b0421dDc1eB216D230Bc01527422Fb93103" },
    options: { holdersRevenueRatio: 1, protocolRevenueRatio: 0 },
  },
  "morpho-compound": {
    comptrollers: { ethereum: "0x930f1b46e1d081ec1524efd95752be3ece51ef67" },
  },
  "strike": {
    comptrollers: { ethereum: "0xe2e17b2CBbf48211FA7eB8A875360e5e39bA2602" },
    options: { useExchangeRate: true, blacklists: ["0xc13fdf3af7ec87dca256d9c11ff96405d360f522", "0x1ebfd36223079dc79fefc62260db9e25f3f5e2c7"], protocolRevenueRatio: 1 },
  },
  "sumer": {
    comptrollers: { meter: "0xcB4cdDA50C1B6B0E33F544c98420722093B7Aa88", base: "0x611375907733D9576907E125Fb29704712F0BAfA", arbitrum: "0xBfb69860C91A22A2287df1Ff3Cdf0476c5aab24A", ethereum: "0x60A4570bE892fb41280eDFE9DB75e1a62C70456F", zklink: "0xe6099D924efEf37845867D45E3362731EaF8A98D", bsquared: "0xdD9C863197df28f47721107f94eb031b548B5e48", core: "0x7f5a7aE2688A7ba6a9B36141335044c058a08b3E", bsc: "0x15B5220024c3242F7D61177D6ff715cfac4909eD", berachain: "0x16C7d1F9EA48F7DE5E8bc3165A04E8340Da574fA", hemi: "0xB2fF02eEF85DC4eaE95Ab32AA887E0cC69DF8d8E" },
    options: { protocolRevenueratio: 1 },
  },
  "takara-lend": {
    comptrollers: { sei: "0x71034bf5eC0FAd7aEE81a213403c8892F3d8CAeE" },
    options: { useExchangeRate: true, protocolRevenueRatio: 1 },
  },
  "traderjoe-lend": {
    comptrollers: { avax: "0xdc13687554205E5b89Ac783db14bb5bba4A1eDaC" },
    options: { protocolRevenueRatio: 1 },
  },
  "venus-finance": {
    comptrollers: { bsc: "0xfD36E2c2a6789Db23113685031d7F16329158384", ethereum: "0x687a01ecF6d3907658f7A7c714749fAC32336D1B", op_bnb: "0xd6e3e2a1d8d95cae355d15b3b9f8e5c2511874dd", arbitrum: "0x317c1A5739F39046E20b08ac9BeEa3f10fD43326", era: "0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1", base: "0x0C7973F9598AA62f9e03B94E92C967fD5437426C", optimism: "0x5593FF68bE84C966821eEf5F0a988C285D5B7CeC", unichain: "0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe" },
    options: { protocolRevenueRatio: 0.6, holdersRevenueRatio: 0.4 },
  },
  "mare-finance-v2": {
    comptrollers: { kava: "0xFcD7D41D5cfF03C7f6D573c9732B0506C72f5C72" },
  },
};

const feesProtocols: Record<string, any> = {};
for (const [name, { comptrollers, options }] of Object.entries(feesConfigs)) {
  feesProtocols[name] = compoundV2Export(comptrollers, options);
}


export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
