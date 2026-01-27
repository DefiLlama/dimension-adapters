import { compoundV2Export } from "../../helpers/compoundV2";

const comptrollers = {
  sonic: "0x646F91AbD5Ab94B76d1F9C5D9490A2f6DDf25730",
};

export default compoundV2Export(comptrollers, { protocolRevenueRatio: 1 });
