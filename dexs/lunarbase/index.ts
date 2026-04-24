import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const POOLS = [
    {
        address: "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab",
        feeModel: "legacy",
    },
    {
        address: "0x00003bf45Ce34Bf1BeA78669f9A40ee630e11b99",
        feeModel: "dark_pools_v2",
    },
    {
        address: "0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99",
        feeModel: "dark_pools_v2",
    }
] as const;

const POOL_ADDRESSES = POOLS.map(({ address }) => address);
const LEGACY_POOL_ADDRESSES = POOLS
    .filter(({ feeModel }) => feeModel === "legacy")
    .map(({ address }) => address);

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
        targets: POOL_ADDRESSES,
        eventAbi: swapEvent,
        flatten: false,
        toBlock,
    });

    // `options.api` is already pinned to this slice's `toBlock`, so these reads stay historical.
    const [tokenXs, tokenYs, legacyTreasuryShareBpsValues, legacyTotalBpsValues] = await Promise.all([
        options.api.multiCall({ abi: poolAbis.tokenX, calls: POOL_ADDRESSES, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.tokenY, calls: POOL_ADDRESSES, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.treasuryShareBps, calls: LEGACY_POOL_ADDRESSES, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.bps, calls: LEGACY_POOL_ADDRESSES, permitFailure: true }),
    ]);
    const legacyPoolParamsByAddress = new Map(
        LEGACY_POOL_ADDRESSES.map((address, index) => [
            address,
            {
                treasuryShareBps: legacyTreasuryShareBpsValues[index],
                totalBps: legacyTotalBpsValues[index],
            },
        ]),
    );

    for (let i = 0; i < POOLS.length; i++) {
        const { address: pool, feeModel } = POOLS[i];
        const tokenX = tokenXs[i];
        const tokenY = tokenYs[i];
        const logs = swapLogs[i];
        if (!logs?.length) continue;
        if (typeof tokenX !== "string" || typeof tokenY !== "string") {
            throw new Error(`Failed to resolve token pair for ${pool}`);
        }

        const legacyPoolParams = legacyPoolParamsByAddress.get(pool);
        const treasuryShareBps = legacyPoolParams?.treasuryShareBps;
        const totalBps = legacyPoolParams?.totalBps;
        if (feeModel === "legacy" && (isInvalidCallResult(treasuryShareBps) || isInvalidCallResult(totalBps))) {
            console.warn(`Skipping LunarBase pool ${pool} at block ${toBlock}: failed to resolve fee split params`);
            continue;
        }

        for (const log of logs) {
            const { xToY, dx, dy, fee } = log;
            // `SwapExecuted` encodes amounts per pool axis, so input-side volume is:
            // xToY -> dx (X in), yToX -> dy (Y in).
            const volumeToken = xToY ? tokenX : tokenY;
            const volumeAmount = xToY ? dx : dy;
            dailyVolume.add(volumeToken, volumeAmount);

            // Fee is taken from the output side: xToY -> fee in Y, yToX -> fee in X.
            const feeToken = xToY ? tokenY : tokenX;
            const feeBig = toBigIntOrZero(fee);
            dailyFees.add(feeToken, feeBig, METRIC.SWAP_FEES);

            if (feeModel === "legacy") {
                const treasuryShareBpsBig = toBigIntOrZero(treasuryShareBps);
                const totalBpsBig = toBigIntOrZero(totalBps);

                // Legacy PMM pools expose a direct treasuryShare/BPS split.
                const protocolFee = totalBpsBig > 0n ? (feeBig * treasuryShareBpsBig) / totalBpsBig : 0n;
                const supplySideFee = feeBig - protocolFee;
                dailyProtocolRevenue.add(feeToken, protocolFee, METRIC.SWAP_FEES);
                dailySupplySideRevenue.add(feeToken, supplySideFee, METRIC.SWAP_FEES);
                continue;
            }

            // V2 dark_pools route swap fees into treasury/partner accounting, not LP swap-fee buckets.
            // We count the swap fee and treat it as protocol-side until router-level partner rebates are surfaced.
            dailyProtocolRevenue.add(feeToken, feeBig, METRIC.SWAP_FEES);
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
