import { BaseAdapter, BreakdownAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";

const endpoints = {
  [CHAIN.KLAYTN]: "https://gateway.graph.dgswap.io/dgswap-exchange-v2-kaia",
};

const v3Endpoint = {
  [CHAIN.KLAYTN]: "https://gateway.graph.dgswap.io/dgswap-exchange-v3-kaia",
};

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.06% of each swap.",
  SupplySideRevenue: "LPs receive 0.24% of the fees.",
  HoldersRevenue: "",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: Object.keys(endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: getUniV2LogAdapter({ factory: '0x224302153096E3ba16c4423d9Ba102D365a94B2B' }),
        meta: {
          methodology
        }
      }
      return acc
    }, {} as BaseAdapter),
    v3: Object.keys(v3Endpoint).reduce((acc, chain) => {
      acc[chain] = {
        fetch: getUniV3LogAdapter({ factory: '0x7431A23897ecA6913D5c81666345D39F27d946A4' }),
      }
      return acc
    }, {} as BaseAdapter),
  },
};

export default adapter;
