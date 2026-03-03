import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json'
import { METRIC } from "../../helpers/metrics";

const TREASURY_ADDRESS = '0x245db945c485b68fdc429e4f7085a1761aa4d45d';
const MARKETPLACE_ADDRESS = '0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3';
const PROTOCOL_FEE = 0.0425; // 4.25% protocol fee
const CREATOR_FEE = 0.01; // 1% creator fee

const fetch = async (options: FetchOptions) => {
    const dailyProtocolRevenue = await addTokensReceived({
        options,
        tokens: [ADDRESSES.ronin.AXS, ADDRESSES.null,
        ADDRESSES.ronin.WETH, ADDRESSES.ronin.USDC],
        target: TREASURY_ADDRESS,
    });

    const dailyMarketplaceProtocolRevenue = await addTokensReceived({
        options,
        fromAdddesses: [MARKETPLACE_ADDRESS],
        tokens: [ADDRESSES.ronin.WETH],
        target: TREASURY_ADDRESS,
    });

    let dailyCreatorsRevenue = dailyMarketplaceProtocolRevenue.clone(CREATOR_FEE / PROTOCOL_FEE, METRIC.CREATOR_FEES);

    let dailyFees = dailyProtocolRevenue.clone(1, METRIC.PROTOCOL_FEES);
    dailyFees.addBalances(dailyCreatorsRevenue);

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
    };
}

const methodology = {
    Fees: 'All fees paid axie infinity users trading on marketplace and other in-game activities.',
    Revenue: 'Fees collected by the protocol post creator fee reduction.',
    ProtocolRevenue: 'All the revenue goes to protocol treasury',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.PROTOCOL_FEES]: 'Marketplace fees (4.25%) collected by the protocol treasury from NFT trades on Axie marketplace and in-game activities',
        [METRIC.CREATOR_FEES]: 'Creator royalty fees (1%) paid to NFT creators from marketplace trades',
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: 'All marketplace fees retained by the protocol treasury after excluding creator royalties',
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: 'All marketplace fees retained by the protocol treasury after excluding creator royalties',
    },
};

const adapters: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.RONIN],
    fetch,
    start: '2023-04-27',
    methodology,
    breakdownMethodology,
};

export default adapters;
