import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  canto: "0x5E23dC409Fc2F832f83CEc191E245A191a4bCc5C",
};

export default compoundV2Export(comptrollers, { protocolRevenueRatio: 1 });
