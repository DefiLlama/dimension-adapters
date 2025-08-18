import { CHAIN } from "../helpers/chains";
import type {  SimpleAdapter } from "../adapters/types"
import { getFeesExport,  } from "../helpers/balancer";

const methodology = {
  UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
  Fees: "All trading fees collected (doesn't include withdrawal and flash loan fees)",
  Revenue: "Protocol revenue from all fees collected",
  ProtocolRevenue: "Currently no protocol swap fee in place",
  SupplySideRevenue: "A small percentage of the trade paid by traders to pool LPs, set by the pool creator or managed by protocol.",
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.NEON]: {
      fetch:getFeesExport('0x7122e35ceC2eED4A989D9b0A71998534A203972C'),
      start: '2023-07-17', // 17TH JULY 5PM GMT
    },
    [CHAIN.BASE]: {
      fetch: getFeesExport('0x7122e35ceC2eED4A989D9b0A71998534A203972C'),
      start: '2023-08-01', // 1ST AUG 12:33 AM GMT
    }
  },
  methodology
}

export default adapter;
