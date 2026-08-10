
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const V3_POOL_FACTORY = "0xE749c1cA2EA4f930d1283ad780AdE28625037CeD";
const V3_POOL_LOGGER = "0x77c8dfFE4130FE58e5C3c02a2E7ab6DB7f4F474f";

const V3_SWAP_EVENT = "event Swap(address indexed pool, bool zeroForOne, uint256 amountIn, uint256 amountOut)";
const PROTOCOL_FEE_DENOMINATOR = 10_000n;
const SWAP_FEE_DENOMINATOR = 1_000_000n;

type Swap = {
    poolKey: string;
    pool: string;
    zeroForOne: boolean;
    amountIn: bigint;
    amountOut: bigint;
};

const fetch: FetchV2 = async (options: FetchOptions) => {
    const { createBalances, getLogs, api } = options;

    const dailyVolume = createBalances();
    const dailyFees = createBalances();

    // defaultProtocolFee() = 2000 bps -> 20% of fees to protocol, 80% to LPs
    let protocolFeeBps = 2000n;
    const v = await api.call({
        target: V3_POOL_FACTORY,
        abi: "function defaultProtocolFee() view returns (uint256)",
    });
    protocolFeeBps = BigInt(v.toString());

    const logs = await getLogs({
        target: V3_POOL_LOGGER,
        eventAbi: V3_SWAP_EVENT,
    });

    const swaps: Swap[] = [];
    const poolSet = new Set<string>();

    for (const l of logs) {
        const { pool, zeroForOne, amountIn, amountOut } = l;

        swaps.push({ pool, poolKey: pool, zeroForOne, amountIn, amountOut });
        poolSet.add(pool);
    }

    const pools = [...poolSet];

    // Read pool metadata (IConcentratedLiquidityPool)
    const [token0sRaw, token1sRaw, swapFeesRaw] = await Promise.all([
        api.multiCall({ abi: "address:token0", calls: pools, permitFailure: true }),
        api.multiCall({ abi: "address:token1", calls: pools, permitFailure: true }),
        api.multiCall({
            abi: "function swapFee() view returns (uint24)",
            calls: pools,
            permitFailure: true,
        }),
    ]);

    const meta = new Map<string, { token0: string; token1: string; feePips: bigint }>();
    for (let i = 0; i < pools.length; i++) {
        const token0 = token0sRaw[i];
        const token1 = token1sRaw[i];
        const fee = swapFeesRaw[i];

        const feePips = BigInt(fee);
        meta.set(pools[i], { token0: String(token0), token1: String(token1), feePips });
    }

    // Aggregate balances
    for (const swap of swaps) {
        const m = meta.get(swap.poolKey);
        if (!m) continue;

        // Per-token exchanged amounts
        // zeroForOne: token0 -> token1
        const amount0 = swap.zeroForOne ? swap.amountIn : swap.amountOut;
        const amount1 = swap.zeroForOne ? swap.amountOut : swap.amountIn;

        addOneToken({ balances: dailyVolume, token0: m.token0, amount0, token1: m.token1, amount1 })
        addOneToken({ balances: dailyFees, token0: m.token0, amount0: amount0 * m.feePips / SWAP_FEE_DENOMINATOR, token1: m.token1, amount1: amount1 * m.feePips / SWAP_FEE_DENOMINATOR })
    }

    const dailyProtocolRevenue = dailyFees.clone(Number(protocolFeeBps) / Number(PROTOCOL_FEE_DENOMINATOR));
    const dailySupplySideRevenue = dailyFees.clone(1 - Number(protocolFeeBps) / Number(PROTOCOL_FEE_DENOMINATOR));

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Volume: "DEX swap volume on PumpSpace (Trident V3) on Avalanche. ",
    Fees:
        "V3 fees are computed on amountIn using each pool's swapFee() (pips where 1e6 = 100%).",
    UserFees: "Users pay V3 swapFee() per swap.",
    Revenue:
        "V3: protocol share is determined by MiningPoolFactory.defaultProtocolFee() (bps, currently 2000 = 20% of fees).",
    ProtocolRevenue:
        "Treasury share of fees. V3: defaultProtocolFee() share (currently 20% of fees).",
    SupplySideRevenue:
        "Liquidity providers' share of fees. V3: remaining share after protocol fee (currently 80% of fees).",
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.AVAX],
    start: "2025-08-20",
    methodology,
    fetch,
};

export default adapter;
