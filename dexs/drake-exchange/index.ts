import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TRADING = "0xE6dfD064F1CFf4F62236fC862A2543EA98380F32";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
    const dailyVolume = createBalances();

    const logs = await getLogs({
        target: TRADING,
        eventAbi:
            "event TakerOrderExecuted(uint256 indexed orderId, address indexed portfolio, uint256 indexed instId, uint8 side, uint8 orderKind, uint256 executionPrice, uint256 orderbookVolume, uint256 vaultVolume)",
    });

    logs.forEach((log: any) => {
        const total = BigInt(log.orderbookVolume) + BigInt(log.vaultVolume);
        dailyVolume.add(AUSD, total);
    });

    return { dailyVolume };
};

export default {
    version: 2,
    adapter: {
        [CHAIN.MONAD]: { fetch, start: 1783409183 },
    },
} as SimpleAdapter;
