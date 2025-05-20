import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions } from "../adapters/types";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";

const ethereumWallets = ['null']

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const { dailyFees, dailyRevenue } = await fetchL2FeesWithDune(options, {
        chainName: 'polygon',
        ethereumWallets,
        blobSubmitterLabel: 'Polygon'
    });
    return {
        dailyFees
    }
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.POLYGON]: {
            fetch,
            start: '2020-05-30'
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter;
