import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/solarbeam";
import { Adapter, BaseAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TOTAL_FEES = 0.0025;
const PROTOCOL_FEES = 0.0005;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MOONRIVER]: {
      fetch: feeAdapter.moonriver.fetch,
      start: '2021-09-06'
    }
  }
};

export default adapter;
// ref https://docs.solarbeam.io/faq#is-there-a-transaction-fee-on-solarbeam
