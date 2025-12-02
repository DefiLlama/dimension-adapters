import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  avax: "0xdc13687554205E5b89Ac783db14bb5bba4A1eDaC",
};

export default compoundV2Export(comptrollers, { protocolRevenueRatio: 1 });
