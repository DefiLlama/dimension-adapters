import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const STABLECOIN_DEX = "0xdec0000000000000000000000000000000000000";

const eventOrderPlaced =
    "event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)";

const eventOrderFilled =
    "event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)";

const methodology = {
    Volume: "Sum of OrderFilled.amountFilled emitted by Tempo's Stablecoin DEX precompile (0xdec0…0000) over the day, denominated in each fill's base-token units.",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume = options.createBalances();

    const orderPlacedLogs = await options.getLogs({
        target: STABLECOIN_DEX,
        eventAbi: eventOrderPlaced,
        fromBlock: 6200000,
        cacheInCloud: true,
    });

    const orderMap: Map<string, string> = new Map(orderPlacedLogs.map(log => [String(log.orderId), log.token]));

    const orderFilledLogs = await options.getLogs({
        target: STABLECOIN_DEX,
        eventAbi: eventOrderFilled,
    });

    for (const orderFilledLog of orderFilledLogs) {
        const orderToken = orderMap.get(String(orderFilledLog.orderId));
        if (!orderToken) continue;
        dailyVolume.add(orderToken, BigInt(orderFilledLog.amountFilled));
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    pullHourly: true,
    methodology,
    chains: [CHAIN.TEMPO],
    start: "2026-03-18", // Tempo Mainnet "Presto" launch (chainId 4217)
};

export default adapter;
