import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions } from "../../adapters/types";
import { fetchLiteEth } from "./lite-eth";
import { fetchLiteUsd } from "./lite-usd";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const [eth, usd] = await Promise.all([
    fetchLiteEth(options),
    fetchLiteUsd(options),
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addBalances(eth.dailyFees);
  dailyFees.addBalances(usd.dailyFees);
  dailyRevenue.addBalances(eth.dailyRevenue);
  dailyRevenue.addBalances(usd.dailyRevenue);

  return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
  version: 1,
  methodology: {
    Fees:
      "Lite Vault charges a 20% performance fee on vaults and an additional 0.05% exit fee on Fluid Lite ETH. Fluid Lite USD charges withdrawal fees, and treasury revenue includes yield when actual vault yield exceeds the fixed rate paid to depositors. Revenue is collected and transferred to the Instadapp treasury.",
    Revenue:
      "Lite Vault charges a 20% performance fee on vaults and an additional 0.05% exit fee on Fluid Lite ETH. Fluid Lite USD charges withdrawal fees, and treasury revenue includes yield when actual vault yield exceeds the fixed rate paid to depositors. Revenue is collected and transferred to the Instadapp treasury.",
  },
  breakdownMethodology: {
    Fees: {
      "Lite Vaults Fees":
        "Lite Vault charges a 20% performance fee on vaults and an additional 0.05% exit fee on Fluid Lite ETH. Fluid Lite USD charges withdrawal fees; treasury revenue includes yield when actual vault yield exceeds the fixed rate paid to depositors.",
    },
    Revenue: {
      "Lite Vaults Fees":
        "Lite vaults fees are collected as revenue and transferred to the Instadapp treasury.",
    },
    ProtocolRevenue: {
      "Lite Vaults Fees":
        "Lite vaults fees are collected as revenue and transferred to the Instadapp treasury.",
    },
  },
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2023-02-13",
};

export default adapter;
