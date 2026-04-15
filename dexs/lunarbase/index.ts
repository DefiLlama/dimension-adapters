import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { METRIC } from "../../helpers/metrics";

const CURVE_PMMS = [
    "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab",
    "0x00003bf45Ce34Bf1BeA78669f9A40ee630e11b99",
];

const poolAbis = {
    tokenX: "address:X",
    tokenY: "address:Y",
    treasuryShareBps: "uint24:treasuryShareBps",
    bps: "uint256:BPS",
};

const swapEvent =
    "event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee)";

const toBigIntOrZero = (value: any): bigint => {
    if (value === null || value === undefined) return 0n;
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    return BigInt(value.toString());
};

const isInvalidCallResult = (value: any): boolean => {
    if (value === null || value === undefined) return true;
    return value instanceof Error || (typeof value === "object" && "error" in value);
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const toBlock = await options.getToBlock();

    const swapLogs = await options.getLogs({
        targets: CURVE_PMMS,
        eventAbi: swapEvent,
        flatten: false,
        toBlock,
    });

    // `options.api` is already pinned to this slice's `toBlock`, so these reads stay historical.
    const [tokenXs, tokenYs, treasuryShareBpsValues, totalBpsValues] = await Promise.all([
        options.api.multiCall({ abi: poolAbis.tokenX, calls: CURVE_PMMS, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.tokenY, calls: CURVE_PMMS, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.treasuryShareBps, calls: CURVE_PMMS, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.bps, calls: CURVE_PMMS, permitFailure: true }),
    ]);

    for (let i = 0; i < CURVE_PMMS.length; i++) {
        const pool = CURVE_PMMS[i];
        const tokenX = tokenXs[i];
        const tokenY = tokenYs[i];
        const logs = swapLogs[i];
        if (!logs?.length) continue;
        if (typeof tokenX !== "string" || typeof tokenY !== "string") {
            throw new Error(`Failed to resolve token pair for ${pool}`);
        }

        const treasuryShareBps = treasuryShareBpsValues[i];
        const totalBps = totalBpsValues[i];
        if (isInvalidCallResult(treasuryShareBps) || isInvalidCallResult(totalBps)) {
            console.warn(`Skipping LunarBase pool ${pool} at block ${toBlock}: failed to resolve fee split params`);
            continue;
        }

        for (const log of logs) {
            const { xToY, dx, dy, fee } = log;
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenX, token1: tokenY, amount0: dx, amount1: dy });

            // Fee is taken from the output side: xToY -> fee in Y, yToX -> fee in X
            const feeToken = xToY ? tokenY : tokenX;
            dailyFees.add(feeToken, fee, METRIC.SWAP_FEES);

            const feeBig = toBigIntOrZero(fee), treasuryShareBpsBig = toBigIntOrZero(treasuryShareBps), totalBpsBig = toBigIntOrZero(totalBps);

            // Split: treasury gets treasuryShareBps/BPS, LPs get the rest
            const protocolFee = totalBpsBig > 0n ? (feeBig * treasuryShareBpsBig) / totalBpsBig : 0n;
            const supplySideFee = feeBig - protocolFee;
            dailyProtocolRevenue.add(feeToken, protocolFee, METRIC.SWAP_FEES);
            dailySupplySideRevenue.add(feeToken, supplySideFee, METRIC.SWAP_FEES);
        }

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
