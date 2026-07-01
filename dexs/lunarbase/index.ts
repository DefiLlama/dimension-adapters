import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const POOLS = [
    "0x6Ccc8223532fff07f47EF4311BEB3647326894Ab",
    "0x00003bf45Ce34Bf1BeA78669f9A40ee630e11b99",
    "0x0000eFC4ec03a7c47D3a38A9Be7Ff1d52dD01b99",
] as const;

const poolAbis = {
    tokenX: "address:X",
    tokenY: "address:Y",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const swapEvent =
    "event SwapExecuted(address recipient, bool xToY, uint256 dx, uint256 dy, uint256 fee)";

const isFailedCallResult = (value: any) => {
    return value instanceof Error || (typeof value === "object" && value !== null && "error" in value);
};

const isNativeToken = (token: any) => {
    return token === null || token === undefined || token.toLowerCase?.() === ZERO_ADDRESS;
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const swapLogs = await options.getLogs({
        targets: POOLS,
        eventAbi: swapEvent,
        flatten: false,
    });

    const [tokenXs, tokenYs] = await Promise.all([
        options.api.multiCall({ abi: poolAbis.tokenX, calls: POOLS, permitFailure: true }),
        options.api.multiCall({ abi: poolAbis.tokenY, calls: POOLS, permitFailure: true }),
    ]);

    for (let i = 0; i < POOLS.length; i++) {
        const pool = POOLS[i];
        const tokenX = tokenXs[i];
        const tokenY = tokenYs[i];
        const logs = swapLogs[i];
        if (!logs?.length) continue;
        if (isFailedCallResult(tokenX) || isFailedCallResult(tokenY)) {
            throw new Error(`Failed to resolve token pair for ${pool}`);
        }

        for (const log of logs) {
            const { xToY, dx, dy } = log;
            // `SwapExecuted` encodes amounts per pool axis, so input-side volume is:
            // xToY -> dx (X in), yToX -> dy (Y in).
            const volumeToken = xToY ? tokenX : tokenY;
            const volumeAmount = xToY ? dx : dy;
            if (isNativeToken(volumeToken)) dailyVolume.addGasToken(volumeAmount);
            else dailyVolume.add(volumeToken, volumeAmount);
        }
    }

    return {
        dailyVolume,
    };
};

const methodology = {
    Volume: "The amount of tokens that are swapped through the protocol.",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: "2026-03-19",
    methodology,
};

export default adapter;
