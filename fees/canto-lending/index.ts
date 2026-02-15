import { compoundV2Export } from "../../helpers/compoundV2";
import { METRIC } from "../../helpers/metrics";

const comptrollers = {
  canto: "0x5E23dC409Fc2F832f83CEc191E245A191a4bCc5C",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers on their outstanding loans across all markets',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Portion of borrow interest retained by the protocol (reserve factor)',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of borrow interest allocated to treasury (100% of revenue)',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Borrow interest distributed to liquidity suppliers/lenders',
  },
};

export default compoundV2Export(
  comptrollers,
  {
    protocolRevenueRatio: 1,
    breakdownMethodology,
  }
);
