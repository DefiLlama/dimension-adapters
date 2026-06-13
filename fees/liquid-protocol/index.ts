import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { addTokensReceived } from "../../helpers/token"

const LIQUID_FACTORY = '0x04F1a284168743759BE6554f607a10CEBdB77760';
const WETH = '0x4200000000000000000000000000000000000006';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const deploymentFees = await addTokensReceived({
        options,
        targets: [LIQUID_FACTORY],
        token: WETH,
    })

    const dailyFees = deploymentFees.clone(1, 'Deployment Fees')
    const dailyRevenue = deploymentFees.clone(0.5, 'Deployment Fees to protocol')
    const dailySupplySideRevenue = deploymentFees.clone(0.5, 'Deployment Fees to Rainbow')

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: 'Includes 0.2% deployment fee collected by the Liquid Factory contract on Base',
    Revenue: '50% of the deployment fees go to the protocol',
    ProtocolRevenue: '50% of the deployment fees go to the protocol',
    SupplySideRevenue: '50% of the deployment fees go to Rainbow wallet',
}

const breakdownMethodology = {
    Fees: {
        'Deployment Fees': '0.2% deployment fee collected by the Liquid Factory contract on Base',
    },
    Revenue: {
        'Deployment Fees to protocol': '50% of the deployment fees go to the protocol',
    },
    ProtocolRevenue: {
        'Deployment Fees to protocol': '50% of the deployment fees go to the protocol',
    },
    SupplySideRevenue: {
        'Deployment Fees to Rainbow': '50% of the deployment fees go to Rainbow wallet',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BASE],
    fetch,
    start: '2026-03-14',
    methodology,
    breakdownMethodology,
}

export default adapter