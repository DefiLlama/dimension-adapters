import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";

const methodology = {
    Fees: "Swap fees paid by traders on each trade.",
    SupplySideRevenue: "All swap fees are distributed to liquidity providers."
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: 'Variable-rate swap fees (0.01% - 1%) paid by traders on each token swap, determined by pool tier'
    },
    SupplySideRevenue: {
        [METRIC.LP_FEES]: 'All swap fees are distributed to liquidity providers in each pool'
    }
};

const adapter = uniV3Exports({
    [CHAIN.ASSETCHAIN]: { factory: '0xa9d53862D01190e78dDAf924a8F497b4F8bb5163' },
});

adapter.methodology = methodology;
adapter.breakdownMethodology = breakdownMethodology;

export default adapter;
