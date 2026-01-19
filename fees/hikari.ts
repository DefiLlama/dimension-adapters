import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const AUSD_TOKEN = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const BASELINE_CONTRACT = "0xE788dfA236CC9973750239593Db189ac78Afb2C6";
const hikariPool = "0x2ac7673C3a0370dE512A20464a800fa7C53235C3";

const FEE_EVENT = 
    "event Collect(address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)";

const SWAP_EVENT = 
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyVolume = options.createBalances();
    
    const logs = await options.getLogs({
        target: hikariPool,
        eventAbi: FEE_EVENT
    });

    const swapLogs = await options.getLogs({
        target: hikariPool,
        eventAbi: SWAP_EVENT
    });

    logs.forEach((log) => {
        if (log.recipient === BASELINE_CONTRACT) dailyFees.add(AUSD_TOKEN, log.amount0);
    });

    swapLogs.forEach((swapLog) => {
        const amount0 = Number(swapLog.amount0) / 1e6;
        if(amount0 > 0) dailyVolume.addUSDValue(amount0);
        else dailyVolume.addUSDValue(-amount0);
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyVolume: dailyVolume,
    }
}

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "Fees collected from the Hikari pool's Concentrated Liquidity.",
        Revenue: "Revenue collected from the Hikari pool.",
        Volume: "Volume collected from the Hikari pool."
    },
    version: 2,
    adapter: {
        [CHAIN.KATANA]: {
            fetch: fetch as any,
            start: '2025-07-8'
        }
    }
}

export default adapter;