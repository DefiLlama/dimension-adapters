import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token"

async function fetch(options: FetchOptions) {
    const buybackWallet = '0x5E4969C41ca9F9831468B98328A370b7AbD5a397';
    const twapContract = '0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994';
    const asterToken = '0x000ae314e2a2172a039b26378814c252734f556a';

    const dailyHoldersRevenue = await addTokensReceived({
        options,
        targets: [buybackWallet],
        fromAddressFilter: twapContract,
        token: asterToken,
    });

    return {
        dailyHoldersRevenue,
    }
}

const methodology = {
    HoldersRevenue: "Aster token strategic buybacks from platform fees"
}

const adapter: Adapter = {
    version: 2,
    fetch,
    chains: [CHAIN.BSC],
    start: '2026-01-19',
    methodology,
}

export default adapter;