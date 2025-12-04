
import { compoundV2Export, } from "../../helpers/compoundV2";

const unitroller = "0x71034bf5eC0FAd7aEE81a213403c8892F3d8CAeE";

export default compoundV2Export({ sei: unitroller}, { useExchangeRate: true, protocolRevenueRatio: 1 });