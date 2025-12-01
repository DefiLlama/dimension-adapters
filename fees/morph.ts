import { FetchOptions, FetchResultV2, ProtocolType, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'

// const eventAbi = 'event RecipientRecieved( address indexed recipient,uint256 value)'
async function getFees(options: FetchOptions) {
    const l2FeeVault = '0x530000000000000000000000000000000000000A'
    const feeVaults = [l2FeeVault]

    const { api, fromApi, createBalances } = options
    const balances = createBalances()
    await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
    await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
    // const logs = await getLogs({ targets: feeVaults, eventAbi, })

    // logs.map((log) => balances.addGasToken(log.value))
    balances.addBalances(api.getBalancesV2())
    balances.subtract(fromApi.getBalancesV2())
    return balances
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = await getFees(options)

    return { dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.MORPH],
    fetch,
    start: '2024-10-29',
    protocolType: ProtocolType.CHAIN,
    methodology: {
        Fees: 'Transaction fees paid by users',
        Revenue: 'Total revenue on Morph',
    },
    isExpensiveAdapter: true,
    allowNegativeValue: true, // L1 Costs
}

export default adapter
