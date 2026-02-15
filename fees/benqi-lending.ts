import { compoundV2Export, } from "../helpers/compoundV2";
import { METRIC } from "../helpers/metrics";

const unitroller = "0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4";

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers on their outstanding loans',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Portion of borrow interest retained by the protocol (reserve factor)',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest allocated to treasury',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Borrow interest distributed to liquidity suppliers/lenders',
  },
};

export default compoundV2Export(
  { avax: unitroller },
  {
    holdersRevenueRatio: 0,
    protocolRevenueRatio: 1,
    breakdownMethodology,
  }
);
