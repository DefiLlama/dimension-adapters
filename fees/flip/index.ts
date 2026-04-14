import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const defaultFeeCollectors = [
    '0x98114De4823484313d56b8a8D90c55224CE571AC',
    '0xab726237d912909c1b99a31d7194a30be84286ce',
];

const fetch = async (options: FetchOptions) => {
    const dailyFees = await getETHReceived({ options, targets: defaultFeeCollectors })

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }

}

const methodology = {
    Fees: 'Total native ETH received by fee collector wallets on Base',
    Revenue: 'All the fees are revenue',
    ProtocolRevenue: 'All the fees goes to the protocol',
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: '2026-04-01',
    methodology,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
}

export default adapter;
