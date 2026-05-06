import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const HUB = '0x8880b95E1a056d537FA7469D1a26C3875e85f0e7'
const ORDER_EXECUTED_CONTRACT = '0xF5Da71cdb870494D36c6d3f1E81DDF5FDB786079'
const ORDER_EXECUTED_EVENT = 'event OrderExecuted(bytes32 indexed orderKey, uint128 liquidity, uint256 fee0, uint256 fee1, uint256 returned0, uint256 returned1)'
const VAULT_HUB_ABI = 'function hub() view returns (address)'

const GET_ORDER_ABI = {
    inputs: [{ internalType: 'bytes32', name: 'orderKey', type: 'bytes32' }],
    name: 'getOrder',
    outputs: [{
        components: [
            { internalType: 'address', name: 'vault', type: 'address' },
            { internalType: 'address', name: 'adapter', type: 'address' },
            { internalType: 'address', name: 'token0', type: 'address' },
            { internalType: 'address', name: 'token1', type: 'address' },
            { internalType: 'uint256', name: 'capital', type: 'uint256' },
            { internalType: 'bool', name: 'isSell', type: 'bool' },
            { internalType: 'int24', name: 'targetTick', type: 'int24' },
            { internalType: 'uint24', name: 'triggerTicks', type: 'uint24' },
            { internalType: 'bytes', name: 'adapterData', type: 'bytes' },
            { internalType: 'address', name: 'referrer', type: 'address' },
            { internalType: 'bool', name: 'keepBalancesInVault', type: 'bool' },
            { internalType: 'bool', name: 'unwrapOut', type: 'bool' },
            { internalType: 'bool', name: 'closed', type: 'bool' },
            { internalType: 'uint32', name: 'rerangeCount', type: 'uint32' },
            { internalType: 'uint40', name: 'createdAt', type: 'uint40' },
            { internalType: 'uint40', name: 'lastRerangeAt', type: 'uint40' },
            { internalType: 'uint256', name: 'accruedFee0', type: 'uint256' },
            { internalType: 'uint256', name: 'accruedFee1', type: 'uint256' },
            { internalType: 'uint256', name: 'idle0', type: 'uint256' },
            { internalType: 'uint256', name: 'idle1', type: 'uint256' },
        ],
        internalType: 'struct RerangeTypes.Order',
        name: '',
        type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
};

const getOrderToken = (order: any, key: 'token0' | 'token1', index: 2 | 3): string | null => {
    if (!order) return null
    return order[key] ?? order[index] ?? null
}

const fetch = async ({ createBalances, getLogs, api }: FetchOptions) => {
    const dailyFees = createBalances()

    const logs = await getLogs({
        target: ORDER_EXECUTED_CONTRACT,
        eventAbi: ORDER_EXECUTED_EVENT,
        entireLog: true,
        parseLog: true,
    })

    const vaultAddresses = [...new Set(logs.map((log: any) => String(log.address).toLowerCase()))]
    const vaultHubs = await api.multiCall({
        abi: VAULT_HUB_ABI,
        calls: vaultAddresses,
        permitFailure: true,
    })

    const rerangeVaultSet = new Set(
        vaultAddresses.filter((_vault, index) => String(vaultHubs[index] ?? '').toLowerCase() === HUB.toLowerCase())
    )

    const rerangeLogs = logs.filter((log: any) => rerangeVaultSet.has(String(log.address).toLowerCase()))

    const orders = await api.multiCall({
        abi: GET_ORDER_ABI,
        calls: rerangeLogs.map((log: any) => ({ target: HUB, params: [log.args.orderKey] })),
        permitFailure: true,
    })

    rerangeLogs.forEach((log: any, index: number) => {
        const order = orders[index]
        if (!order) return

        const token0 = getOrderToken(order, 'token0', 2)
        const token1 = getOrderToken(order, 'token1', 3)

        if (!token0 || !token1) return

        dailyFees.add(token0, log.args.fee0)
        dailyFees.add(token1, log.args.fee1)
    })

    return {
        dailyFees,
    }
}

const methodology = {
    Fees: 'Total LP fees generated during Rerange order execution, measured onchain from vault OrderExecuted events as fee0 + fee1 across reranges and closes.',
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.ETHEREUM, CHAIN.BASE],
    start: '2026-04-15',
    fetch,
    methodology,
}

export default adapter
