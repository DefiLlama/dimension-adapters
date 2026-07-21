import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const POOLS_BY_CHAIN = {
    [CHAIN.BASE]: [
        {
            address: "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab",
            feeModel: "legacy",
        },
        {
            // Multi-token pool: emits no SwapExecuted, so nothing is counted here yet.
            address: "0x00003bf45Ce34Bf1BeA78669f9A40ee630e11b99",
            feeModel: "dark_pools_v2",
        },
        {
            address: "0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99",
            feeModel: "dark_pools_v2",
        },
    ],
    [CHAIN.MONAD]: [
        {
            address: "0x0000a8fd148694aE3E17c079Ce4BBF8187758888",
            feeModel: "dark_pools_v2",
        },
    ],
} as const;

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

    const result = {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
        dailyRevenue: dailyProtocolRevenue,
    };

    const POOLS = POOLS_BY_CHAIN[options.chain as keyof typeof POOLS_BY_CHAIN] ?? [];
    const POOL_ADDRESSES = POOLS.map(({ address }) => address);
    const LEGACY_POOL_ADDRESSES = POOLS
        .filter(({ feeModel }) => feeModel === "legacy")
        .map(({ address }) => address);

    if (POOL_ADDRESSES.length === 0) {
        return result;
    }

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
        // Only the fee split needs these params; volume/fees are always counted.
        const legacyParamsValid =
            !isInvalidCallResult(treasuryShareBps) && !isInvalidCallResult(totalBps);
        if (feeModel === "legacy" && !legacyParamsValid) {
            console.warn(`LunarBase pool ${pool} at block ${toBlock}: fee split params unresolved; counting volume/fees, skipping protocol/supply split`);
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
                if (!legacyParamsValid) continue; // volume + fees counted above; split unresolved
                const treasuryShareBpsBig = toBigIntOrZero(treasuryShareBps);
                const totalBpsBig = toBigIntOrZero(totalBps);

                // Legacy PMM pools expose a direct treasuryShare/BPS split.
                const protocolFee = totalBpsBig > 0n ? (feeBig * treasuryShareBpsBig) / totalBpsBig : 0n;
                const supplySideFee = feeBig - protocolFee;
                dailyProtocolRevenue.add(feeToken, protocolFee, METRIC.SWAP_FEES);
                dailySupplySideRevenue.add(feeToken, supplySideFee, METRIC.SWAP_FEES);
                continue;
            }

            // dark_pools_v2: the fee is an embedded spread that accrues to the
            // market-maker/settler filling the order, not the protocol treasury.
            // Book it as supply-side (liquidity-provider) revenue.
            dailySupplySideRevenue.add(feeToken, feeBig, METRIC.SWAP_FEES);
        }

    }

    return result;
};

const methodology = {
    Volume: "Total value of tokens swapped through LunarBase's pools.",
    Fees: "The spread charged on each swap.",
    UserFees: "The spread paid by traders on each swap.",
    SupplySideRevenue: "Swap spreads earned by the market makers that fill orders in the dark pools, plus the liquidity-provider share of the legacy pool's fee.",
    Revenue: "The protocol's cut: the treasury share of the legacy pool's fee (currently 0). Dark-pool spreads go to the market makers that provide inventory, not the protocol.",
    ProtocolRevenue: "The protocol's cut: the treasury share of the legacy pool's fee (currently 0). Dark-pool spreads go to the market makers that provide inventory, not the protocol.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Spread charged on each swap.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "Spread paid by traders on each swap.",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "Swap spreads paid to the market makers / liquidity providers that supply the pools.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "Treasury share of the legacy pool's swap fee (currently 0).",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "Treasury share of the legacy pool's swap fee (currently 0).",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.BASE]: { fetch, start: "2026-03-19" },
        [CHAIN.MONAD]: { fetch, start: "2026-04-30" },
    },
    methodology,
    breakdownMethodology,
};

export default adapter;
