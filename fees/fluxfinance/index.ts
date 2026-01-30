import { compoundV2Export, } from "../../helpers/compoundV2";

const unitroller = "0x95Af143a021DF745bc78e845b54591C53a8B3A51";

export default compoundV2Export({ ethereum: unitroller}, { protocolRevenueRatio: 1 });
