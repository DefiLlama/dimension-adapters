import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";

const M_TOKEN = "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b";
const MUSD_TOKEN = "0xacA92E438df0B2401fF60dA7E4337B687a2435DA";
const ONE_YEAR = 365 * 24 * 60 * 60;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();
    const api = new sdk.ChainApi({ chain: CHAIN.ETHEREUM });

    const earnerRate = await api.call({
        abi: 'uint32:earnerRate',
        target: M_TOKEN,
    });

    const mTokenBalance = await options.api.call({
        abi: 'function balanceOf(address) returns (uint256)',
        target: M_TOKEN,
        params: MUSD_TOKEN
    });

    const timeframe = options.fromTimestamp && options.toTimestamp ? (options.toTimestamp - options.fromTimestamp) : 24 * 60 * 60;

    const dailyYield = (mTokenBalance * (earnerRate / 100) * (timeframe / ONE_YEAR)) / 100;

    dailyFees.addUSDValue(dailyYield / 1e6);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees
    }
}

const methodology = {
    Fees: "M token yields earned by M backing metamask USD",
    Revenue: "All fees are revenue",
    ProtocolRevenue: "All the revenue goes to protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.LINEA],
    start: '2025-08-12',
    methodology,
};

export default adapter;