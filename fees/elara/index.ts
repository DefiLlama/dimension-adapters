import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  zircuit: "0x695aCEf58D1a10Cf13CBb4bbB2dfB7eDDd89B296",
};

export default compoundV2Export(comptrollers, { protocolRevenueRatio: 1 });
