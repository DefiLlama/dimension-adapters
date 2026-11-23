import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { subscanFeeAdapter } from "../helpers/subscanFees";

const adapter: Adapter = subscanFeeAdapter(CHAIN.BIFROST);

adapter.methodology = {
  Fees: "Transaction fees paid on Bifrost Polkadot, from Subscan's daily fee totals.",
  Revenue: "10% of transaction fees, burned since 2025-11-01.",
  HoldersRevenue: "10% of transaction fees, burned since 2025-11-01.",
};

export default adapter;
