import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_WIZARD_CORE: Record<string, string> = {
    [CHAIN.ETHEREUM]: "0x649A382ab2aecEc5c1B9ac956c4CdaCEDaC96c80",
    [CHAIN.BSC]: "0x22E51c8090086502227a66D2A2E1335D7A5B1aEC",
    [CHAIN.POLYGON]: "0xc1409502815C4274e2e4F0c5EE3a32d0ce76f2c9",
    [CHAIN.BASE]: "0xA2ae391D0740Cb8C8aA40dB7c076591A8b5A2A4d",
    [CHAIN.ARBITRUM]: "0xA8E28f3c117B922867c78039adD25f07D23C5f6E",
};

const swapEvent =
    "event SwapExecuted(uint256 indexed dexIdx, address indexed impl, address indexed caller, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)";

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
    const dailyVolume = createBalances();

    const swapLogs = await getLogs({
        target: SWAP_WIZARD_CORE[chain],
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
