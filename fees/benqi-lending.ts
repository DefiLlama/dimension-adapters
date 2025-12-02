import { compoundV2Export, } from "../helpers/compoundV2";

const unitroller = "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4";

export default compoundV2Export({ avax: unitroller}, { holdersRevenueRatio: 0, protocolRevenueRatio: 1 });
