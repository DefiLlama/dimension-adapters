import { Adapter, FetchOptions } from "../adapters/types";
import { getBuilderExports } from "../helpers/orderly";

const LABEL = 'Orderly Builder Fees';

// Kodiak perps run on Orderly; the builder fee is Kodiak's cut of perps trading,
// all of which is protocol revenue. Wrap the shared Orderly helper to attach a label.
const base = getBuilderExports({ broker_id: "kodiak", start: "2025-10-1" });

const adapter: Adapter = {
  ...base,
  fetch: (async (options: FetchOptions) => {
    const res: any = await (base.fetch as any)(options);

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(Number(res.dailyFees) || 0, LABEL);

    return {
      dailyVolume: res.dailyVolume,
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
  }) as any,
  methodology: {
    Volume: 'Maker/taker volume routed through Kodiak\'s Orderly broker.',
    Fees: 'Builder fees Kodiak collects on Orderly perps trading.',
    Revenue: 'All builder fees collected by Kodiak.',
    ProtocolRevenue: 'All revenue goes to the protocol.',
  },
  breakdownMethodology: {
    Fees: { [LABEL]: 'Builder fees Kodiak collects on Orderly perps trading.' },
    Revenue: { [LABEL]: 'All builder fees collected by Kodiak.' },
    ProtocolRevenue: { [LABEL]: 'All builder fees, kept by the protocol.' },
  },
} as any;

export default adapter;
