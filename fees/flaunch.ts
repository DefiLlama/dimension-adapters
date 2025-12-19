import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived, nullAddress } from "../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const logs = await options.getLogs({
        target: "0x51Bba15255406Cfe7099a42183302640ba7dAFDC",
        eventAbi: "event PoolFeesReceived (bytes32 indexed _poolId, uint256 _amount0, uint256 _amount1)"
    })
    logs.forEach(log => {
        dailyFees.add(nullAddress, log._amount0) // ignoring token received fees for now
    })
    const dailyRevenue = await getETHReceived({ options, target: "0x673A039f6a959Fa9dB65D16781e6deFDe30375D9" })
    dailyFees.addBalances(dailyRevenue)
    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolrevenue: dailyRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.BASE],
    dependencies: [Dependencies.ALLIUM],
    fetch,
    methodology: {
        Fees: "Tokens trading and launching fees paid by users.",
        Revenue: "Tokens trading and launching fees paid by users.",
        ProtocolRevenue: "Tokens trading and launching fees paid by users.",
    }
};

export default adapter;
