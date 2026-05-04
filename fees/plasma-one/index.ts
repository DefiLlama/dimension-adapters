import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const USDT0 = ADDRESSES.plasma.USDT0;

const CARD_SPEND_POOL = "0xc7eda2b178c8488aa98dd1a3711566634d725268";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topic(address: string) {
    return "0x000000000000000000000000" + address.slice(2).toLowerCase();
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const spendLogs = await options.getLogs({
        target: USDT0,
        eventAbi: TRANSFER_EVENT,
        topics: [TRANSFER_TOPIC, null as any, topic(CARD_SPEND_POOL)]
    });

    for (const log of spendLogs) {
        const isMint = log.from === ADDRESSES.null;
        if (isMint) continue;
        dailyVolume.add(USDT0, log.value);
    };

    return {
        dailyVolume
    };
};

const methodology = {
    Volume: "Real-life card expenditure settled on-chain.",
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.PLASMA],
    start: "2025-11-12",
    methodology,
};

export default adapter;
