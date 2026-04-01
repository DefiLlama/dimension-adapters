import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { METRIC } from "../../helpers/metrics";

const CURVE_PMM = "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab";

const swapEvent =
    "event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee)";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const [tokenX, tokenY, treasuryShareBps, BPS] = await Promise.all([
        options.api.call({ target: CURVE_PMM, abi: "address:X" }),
        options.api.call({ target: CURVE_PMM, abi: "address:Y" }),
        options.api.call({ target: CURVE_PMM, abi: "uint24:treasuryShareBps" }),
        options.api.call({ target: CURVE_PMM, abi: "uint256:BPS" }),
    ]);

    const logs = await options.getLogs({
        target: CURVE_PMM,
        eventAbi: swapEvent,
    });

    const tBps = Number(treasuryShareBps);
    const totalBps = Number(BPS);

    for (const log of logs) {
        const { xToY, dx, dy, fee } = log;
        addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenX, token1: tokenY, amount0: dx, amount1: dy });

        // Fee is taken from the output side: xToY → fee in Y, yToX → fee in X
        const feeToken = xToY ? tokenY : tokenX;
        const feeBig = BigInt(fee);
        dailyFees.add(feeToken, feeBig, METRIC.SWAP_FEES);

        // Split: treasury gets treasuryShareBps/BPS, LPs get the rest
        const protocolFee = totalBps > 0 ? (feeBig * BigInt(tBps)) / BigInt(totalBps) : 0n;
        const supplySideFee = feeBig - protocolFee;
        dailyProtocolRevenue.add(feeToken, protocolFee, METRIC.SWAP_FEES);
        dailySupplySideRevenue.add(feeToken, supplySideFee, METRIC.SWAP_FEES);
    }

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
        dailyRevenue: dailyProtocolRevenue,
    };
};

const methodology = {
    Volume: "The amount of tokens that are swapped through the protocol.",
    Fees: "Fees that are collected for each swap transaction.",
    UserFees: "Fees that are paid by the users",
    SupplySideRevenue: "The portion of fees that goes to the liquidity providers.",
    Revenue: "The portion of fees that going to the protocol.",
    ProtocolRevenue: "All the revenue goes to the protocol.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Fees that are collected for each swap transaction.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "Swap fees that are paid by the users.",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "Swap fees that goes to the liquidity providers.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "Swap fees that goes to the protocol.",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "Swap fees that going to the protocol.",
    },
};
const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: "2026-03-19",
    methodology,
    breakdownMethodology,
};

export default adapter;
