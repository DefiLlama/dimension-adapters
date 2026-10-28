import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// SwapWizard aggregator core contracts. Each chain lists every deployed core
// (previous + newly deployed) so volume from all of them is tracked. Verify any
// address on the chain's block explorer by checking it emits SwapExecuted.
const SWAP_WIZARD_CORE: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
        "0x649A382ab2aecEc5c1B9ac956c4CdaCEDaC96c80", // previous core
        "0x221194c1C9c310CD1E3925142dc405b61e969FF5", // new core
    ],
    [CHAIN.BSC]: [
        "0x22E51c8090086502227a66D2A2E1335D7A5B1aEC", // previous core
        "0xf877372F3FA2a8D150F72C389347c5A76B7d2aE9", // new core
    ],
    [CHAIN.POLYGON]: [
        "0xc1409502815C4274e2e4F0c5EE3a32d0ce76f2c9", // previous core
        "0xCfd2d5F8A01A30cfc63A8F9Bf71f48e11a88Ebc3", // new core
    ],
    [CHAIN.BASE]: [
        "0xA2ae391D0740Cb8C8aA40dB7c076591A8b5A2A4d", // previous core
        "0x63171CB9075b96e07ccEbe74CD67c66c35e32d6A", // new core
    ],
    [CHAIN.ARBITRUM]: [
        "0xA8E28f3c117B922867c78039adD25f07D23C5f6E", // previous core
        "0xdBA5F91B0fb6b609067Ea81E99bf1Bf348b61506", // new core
    ],
};

const swapEvent =
    "event SwapExecuted(uint256 indexed dexIdx, address indexed impl, address indexed caller, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)";

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
    const dailyVolume = createBalances();

    const swapLogs = await getLogs({
        targets: SWAP_WIZARD_CORE[chain],
        eventAbi: swapEvent,
    });

    swapLogs.forEach((log: any) => dailyVolume.add(log.tokenOut, log.amountOut));

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    start: "2026-05-19",
    chains: Object.keys(SWAP_WIZARD_CORE),
    methodology: {
        Volume: "Swap volume tracked via SwapExecuted events emitted by the SwapWizard aggregator contracts on each chain.",
    },
};

export default adapter;
