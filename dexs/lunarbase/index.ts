import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { METRIC } from "../../helpers/metrics";
import { ethers } from "ethers";

const CURVE_PMMS = [
    "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab",
    "0x0716f359B3Bf8d03A3d9d39c60ba9820a1671B99",
] as const;

const poolAbis = {
    tokenX: "function X() view returns (address)",
    tokenY: "function Y() view returns (address)",
    treasuryShareBps: "function treasuryShareBps() view returns (uint24)",
    bps: "function BPS() view returns (uint256)",
};
const poolMethods = {
    tokenX: "X",
    tokenY: "Y",
    treasuryShareBps: "treasuryShareBps",
    bps: "BPS",
} as const;

const swapEvent =
    "event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee)";

const rpcUrls = [
    process.env.BASE_RPC,
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://base.llamarpc.com",
].filter(Boolean) as string[];
const poolInterface = new ethers.Interface(Object.values(poolAbis));

const rawCall = async (target: string, fragment: keyof typeof poolAbis) => {
    const method = poolMethods[fragment];
    const data = poolInterface.encodeFunctionData(method);
    let lastError: Error | null = null;

    for (const rpcUrl of rpcUrls) {
        try {
            const response = await globalThis.fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: `${target}-${fragment}`,
                    method: "eth_call",
                    params: [{ to: target, data }, "latest"],
                }),
            });
            const result = await response.json();
            if (result.error || !result.result || result.result === "0x") {
                throw new Error(result.error?.message ?? `eth_call failed for ${fragment}`);
            }
            return poolInterface.decodeFunctionResult(method, result.result)[0];
        } catch (error: any) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError ?? new Error(`eth_call failed for ${fragment}`);
};

const safeCall = async (target: string, fragment: keyof typeof poolAbis, fallback: any = null) => {
    try {
        return await rawCall(target, fragment);
    } catch {
        return fallback;
    }
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const pools = await Promise.all(CURVE_PMMS.map(async (pool) => {
        const [tokenX, tokenY, treasuryShareBps, BPS, logs] = await Promise.all([
            rawCall(pool, "tokenX"),
            rawCall(pool, "tokenY"),
            safeCall(pool, "treasuryShareBps", 0n),
            rawCall(pool, "bps"),
            options.getLogs({
                target: pool,
                eventAbi: swapEvent,
            }),
        ]);

        return {
            pool,
            tokenX,
            tokenY,
            logs,
            treasuryShareBps: Number(treasuryShareBps ?? 0),
            totalBps: Number(BPS),
        };
    }));

    for (const { tokenX, tokenY, logs, treasuryShareBps, totalBps } of pools) {
        for (const log of logs) {
            const { xToY, dx, dy, fee } = log;
            addOneToken({ chain: options.chain, balances: dailyVolume, token0: tokenX, token1: tokenY, amount0: dx, amount1: dy });

            // Fee is taken from the output side: xToY -> fee in Y, yToX -> fee in X
            const feeToken = xToY ? tokenY : tokenX;
            const feeBig = BigInt(fee);
            dailyFees.add(feeToken, feeBig, METRIC.SWAP_FEES);

            // Split: treasury gets treasuryShareBps/BPS, LPs get the rest
            const protocolFee = totalBps > 0 ? (feeBig * BigInt(treasuryShareBps)) / BigInt(totalBps) : 0n;
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
