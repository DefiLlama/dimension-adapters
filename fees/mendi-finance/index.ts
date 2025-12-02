import { compoundV2Export, } from "../../helpers/compoundV2";

const unitroller = "0x1b4d3b0421dDc1eB216D230Bc01527422Fb93103";

export default compoundV2Export({ linea: unitroller}, { holdersRevenueRatio: 1, protocolRevenueRatio: 0 });
