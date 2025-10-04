import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const PACKET_SOLD_ABI = 'event PacketSold(uint256 indexed packetId, address indexed buyer, uint256 price, uint256 packetTypeId)'

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const logs = await options.getLogs({
        target: '0xeBeA10BCd609d3F6fb2Ea104baB638396C037388',
        eventAbi: PACKET_SOLD_ABI
    })

    logs.forEach(log => {
        dailyFees.add(ADDRESSES.base.USDC, log.price, 'Packet Sale Fees')
    })

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyUserFees: dailyFees,
    }
}

const methodology = {
    Fees: "Total card packs sold to users.",
    Revenue: "Total card packs sold to users.",
    UserFees: "Total card packs sold to users."
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.BASE],
    start: '2025-06-04',
    methodology,
}

export default adapter;