import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { METRIC } from "../../helpers/metrics";

const CURVE_PMMS = [
    "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab",
    "0x0716f359B3Bf8d03A3d9d39c60ba9820a1671B99",
] as const;

const poolAbis = {
    tokenX: "address:X",
    tokenY: "address:Y",
    treasuryShareBps: "uint24:treasuryShareBps",
    bps: "uint256:BPS",
} as const;

const swapEvent =
    "event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee)";

const toBigIntOrZero = (value: any): bigint => {
    if (value === null || value === undefined) return 0n;
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    return BigInt(value.toString());
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const toBlock = await options.getToBlock();

    const activePools = (await Promise.all(CURVE_PMMS.map(async (pool) => {
        const logs = await options.getLogs({
            target: pool,
            eventAbi: swapEvent,
            toBlock,
        });
        return logs.length ? { pool, logs } : null;
    }))).filter((pool): pool is { pool: string; logs: any[] } => Boolean(pool));

    if (!activePools.length) {
        return {
            dailyVolume,
            dailyFees,
            dailyUserFees: dailyFees,
            dailySupplySideRevenue,
            dailyProtocolRevenue,
            dailyRevenue: dailyProtocolRevenue,
        };
    }

    const poolAddresses = activePools.map(({ pool }) => pool);
    // `options.api` is already pinned to this slice's `toBlock`, so these reads stay historical.
    const [tokenXs, tokenYs, treasuryShareBpsValues, totalBpsValues] = await Promise.all([
        options.api.multiCall({ abi: poolAbis.tokenX, calls: poolAddresses }),
        options.api.multiCall({ abi: poolAbis.tokenY, calls: poolAddresses }),
        options.api.multiCall({ abi: poolAbis.treasuryShareBps, calls: poolAddresses, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.bps, calls: poolAddresses }),
    ]);

    const pools = activePools.map(({ pool, logs }, index) => {
        const tokenX = tokenXs[index];
        const tokenY = tokenYs[index];
        if (typeof tokenX !== "string" || typeof tokenY !== "string") {
            throw new Error(`Failed to resolve token pair for ${pool} at block ${toBlock}`);
        }

        return {
            pool,
            tokenX,
            tokenY,
            logs,
            treasuryShareBps: toBigIntOrZero(treasuryShareBpsValues[index]),
            totalBps: toBigIntOrZero(totalBpsValues[index]),
        };
    });

    for (const pool of pools) {
        if (!pool) continue;

        const { tokenX, tokenY, logs, treasuryShareBps, totalBps } = pool;
        for (const log of logs) {
            const { xToY, dx, dy, fee } = log;
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenX, token1: tokenY, amount0: dx, amount1: dy });

            // Fee is taken from the output side: xToY -> fee in Y, yToX -> fee in X
            const feeToken = xToY ? tokenY : tokenX;
            const feeBig = BigInt(fee);
            dailyFees.add(feeToken, feeBig, METRIC.SWAP_FEES);

            // Split: treasury gets treasuryShareBps/BPS, LPs get the rest
            const protocolFee = totalBps > 0n ? (feeBig * treasuryShareBps) / totalBps : 0n;
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
