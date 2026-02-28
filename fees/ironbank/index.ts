import { BaseAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  [CHAIN.AVAX]: "0x2eE80614Ccbc5e28654324a66A396458Fa5cD7Cc",
  [CHAIN.OPTIMISM]: "0xE0B57FEEd45e7D908f2d0DaCd26F113Cf26715BF"
};

const adapter =  compoundV2Export(comptrollers, { holdersRevenueRatio: 0 });

(adapter.adapter as BaseAdapter)[CHAIN.ETHEREUM] = {
  fetch: (async (options: FetchOptions) => {
    // ethereum: "0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB", // all interest from bad debt which never can be withdrawn
    return { dailyFees: 0, dailyRevenue: 0, dailySupplySideRevenue: 0, dailyHoldersRevenue: 0 }
  }),
}

export default adapter;
