import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { addTokensReceived } from "../../helpers/token";

// Jumper is LI.FI powered, so it shares LI.FI's fee collectors; derive the chain list from
// LifiFeeCollectors instead of a hand-maintained copy that drifts out of date.
const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(LifiFeeCollectors).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (options: FetchOptions) => ({
          dailyFees: await addTokensReceived({
            options,
            target: LifiFeeCollectors[options.chain].id,
          }),
        }),
        start: LifiFeeCollectors[chain].start,
      },
    };
  }, {}),
  methodology: {
    Fees: 'All fees paid by users for swap and bridge tokens via Jumper Exchange.',
    Revenue: 'All fees are distributed to Jumper Exchange.',
    ProtocolRevenue: 'All fees are distributed to Jumper Exchange.',
  }
};

export default adapter;
