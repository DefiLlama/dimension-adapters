import { BaseAdapter, FetchOptions } from "../../adapters/types";
import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  avax: "0x2eE80614Ccbc5e28654324a66A396458Fa5cD7Cc",
  optimism: "0xE0B57FEEd45e7D908f2d0DaCd26F113Cf26715BF"
};

const adapter =  compoundV2Export(comptrollers);

(adapter.adapter as BaseAdapter)['ethereum'] = {
  fetch: (async (options: FetchOptions) => {
    // ethereum: "0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB", // all interest from bad debt which never can be withdrawn
    return { dailyFees: 0, dailyRevenue: 0, dailySupplySideRevenue: 0, dailyHoldersRevenue: 0 }
  }),
}

export default adapter;
