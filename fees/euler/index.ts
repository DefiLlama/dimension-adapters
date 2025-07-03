import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";

const UINT256_MAX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const eVaultFactories = {
    [CHAIN.ETHEREUM]: "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e",
    [CHAIN.BASE]: "0x7F321498A801A191a93C840750ed637149dDf8D0",
    [CHAIN.SONIC]: "0xF075cC8660B51D0b8a4474e3f47eDAC5fA034cFB",
    [CHAIN.SWELLCHAIN]: "0x238bF86bb451ec3CA69BB855f91BDA001aB118b9",
    [CHAIN.BOB]: "0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4",
    [CHAIN.BERACHAIN]: "0x5C13fb43ae9BAe8470f646ea647784534E9543AF",
    [CHAIN.BSC]: "0x7F53E2755eB3c43824E162F7F6F087832B9C9Df6",
    [CHAIN.UNICHAIN]: "0xbAd8b5BDFB2bcbcd78Cc9f1573D3Aad6E865e752",
    [CHAIN.ARBITRUM]: "0x78Df1CF5bf06a7f27f2ACc580B934238C1b80D50",
    [CHAIN.AVAX]: "0xaf4B4c18B17F6a2B32F6c398a3910bdCD7f26181",
};


const eulerFactoryABI = {
    vaultLength: "function getProxyListLength() view returns (uint256)",
    getProxyListSlice: "function getProxyListSlice(uint256 start, uint256 end) view returns (address[] list)",
}

const eulerVaultABI = {
    asset: "function asset() view returns (address)",
    accumulatedFees: "function accumulatedFees() view returns (uint256)",
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
    convertFees: "event ConvertFees(address indexed account, address indexed protocolReceiver, address indexed governorReceiver, uint256 protocolShares, uint256 governorShares)",
    vaultStatus: "event VaultStatus(uint256 totalShares, uint256 totalBorrows, uint256 accumulatedFees, uint256 cash, uint256 interestAccumulator, uint256 interestRate, uint256 timestamp)",
    interestAccumulated: "event InterestAccrued(address indexed account, uint256 borrowIndex)"
}

const getVaults = async ({ createBalances, api, fromApi, toApi, getLogs, chain, fromTimestamp }: FetchOptions) => {

    const dailyFees = createBalances()
    const dailyRevenue = createBalances()

    const vaults_uppercase = await fromApi.call({ target: eVaultFactories[chain], abi: eulerFactoryABI.getProxyListSlice, params: [0, UINT256_MAX] })
    const vaults = vaults_uppercase.map((vault) => vault.toLowerCase())

    const underlyings = await fromApi.multiCall({ calls: vaults, abi: eulerVaultABI.asset })
    underlyings.forEach((underlying, index) => {
        if (!underlying) underlyings[index] = ADDRESSES.null
    })

    const accumulatedFeesStart = await fromApi.multiCall({ calls: vaults, abi: eulerVaultABI.accumulatedFees })
    const accumulatedFeesEnd = await toApi.multiCall({ calls: vaults, abi: eulerVaultABI.accumulatedFees })

    const yesterdayBlock = await sdk.blocks.getBlock(chain, fromTimestamp - 24 * 60 * 60, {})
    const todayBlockminus1 = await sdk.blocks.getBlock(chain, fromTimestamp - 1, {})

    const lastEventsFromPrevDay = await getLogs({
        targets: vaults,
        fromBlock: yesterdayBlock.number,
        toBlock: todayBlockminus1.number,
        eventAbi: eulerVaultABI.vaultStatus,
        skipIndexer: false,
        flatten: false
    }).then(logs =>
        logs.map(vaultLogs =>
            vaultLogs.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0]
        )
    )

    const vaultStatusLogs = (await getLogs({
        targets: vaults,
        eventAbi: eulerVaultABI.vaultStatus,
        skipIndexer: false,
        flatten: false
    }))

    vaultStatusLogs.forEach((logs, vaultIndex) => {
        const prevDayLog = lastEventsFromPrevDay[vaultIndex]

        if (!prevDayLog) {
            return
        }

        if (logs.length === 0) {
            return
        }

        logs.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        let totalInterest = 0n

        const firstLog = logs[0]
        const prevBorrows = BigInt(prevDayLog.totalBorrows.toString())
        const firstRatio = (BigInt(firstLog.interestAccumulator.toString()) * BigInt(1e18)) /
            BigInt(prevDayLog.interestAccumulator.toString())

        totalInterest += (prevBorrows * (firstRatio - BigInt(1e18))) / BigInt(1e18)

        for (let i = 1; i < logs.length; i++) {
            const prev = logs[i - 1]
            const current = logs[i]

            const currentBorrows = BigInt(prev.totalBorrows.toString())
            const ratio = (BigInt(current.interestAccumulator.toString()) * BigInt(1e18)) /
                BigInt(prev.interestAccumulator.toString())

            const interest = (currentBorrows * (ratio - BigInt(1e18))) / BigInt(1e18)
            totalInterest += interest
        }

        dailyFees.add(underlyings[vaultIndex], totalInterest)
    })

    // Calculate protocol fees from accumulated fees difference (similar to Dune query approach)
    const accumulatedFeesChange = accumulatedFeesEnd.map((feesEnd, i) => {
        const feesStart = accumulatedFeesStart[i]
        return BigInt(feesEnd.toString()) - BigInt(feesStart.toString())
    })

    // Get fees that were converted/distributed during the period
    const convertFeesLogs = await getLogs({ 
        targets: vaults, 
        eventAbi: eulerVaultABI.convertFees, 
        skipIndexer: false,
        flatten: false 
    })

    const convertedFeesShares = convertFeesLogs.map((vaultLogs) => {
        if (!vaultLogs.length) return 0n
        let totalShares = 0n
        for (const log of vaultLogs) {
            totalShares += log.protocolShares + log.governorShares
        }
        return totalShares
    })

    // Total protocol fees = accumulated fees change + converted fees
    // This represents all fees generated during the period
    const totalProtocolFeeShares = accumulatedFeesChange.map((accumulated, i) => {
        return accumulated + convertedFeesShares[i]
    })

    // Convert fee shares to asset amounts
    const protocolFeeAssets = await toApi.multiCall({
        calls: totalProtocolFeeShares.map((feeShares, i) => ({
            target: vaults[i],
            params: [feeShares.toString()]
        })),
        abi: eulerVaultABI.convertToAssets,
        permitFailure: true
    })

    protocolFeeAssets.forEach((assets, i) => {
        if (!assets) return
        dailyRevenue.add(underlyings[i], assets)
    })

    const dailySupplySideRevenue = dailyFees.clone()
    dailySupplySideRevenue.subtract(dailyRevenue)

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}

const fetch = async (options: FetchOptions) => {
    return await getVaults(options)
}

const methodology = {
    Fees: "Interest that is paid by the borrowers to the vaults",
    Revenue: "Protocol fees share",
    ProtocolRevenue: "Protocol fees share",
    SupplySideRevenue: "Interest paid to the lenders"
}

const adapters: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2024-08-18',
            meta: { methodology }
        },
        [CHAIN.SONIC]: {
            fetch,
            start: '2025-01-31',
            meta: { methodology }
        },
        [CHAIN.BASE]: {
            fetch,
            start: '2024-11-27',
            meta: { methodology }
        },
        [CHAIN.SWELLCHAIN]: {
            fetch,
            start: '2025-01-20',
            meta: { methodology }
        },
        [CHAIN.BOB]: {
            fetch,
            start: '2025-01-21',
            meta: { methodology }
        },
        [CHAIN.BERACHAIN]: {
            fetch,
            start: '2025-02-06',
            meta: { methodology }
        },
        [CHAIN.BSC]: {
            fetch,
            start: '2025-02-04',
            meta: { methodology }
        },
        [CHAIN.UNICHAIN]: {
            fetch,
            start: '2025-02-11',
            meta: { methodology }
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2025-01-30',
            meta: { methodology }
        },
        [CHAIN.AVAX]: {
            fetch,
            start: '2025-02-04',
            meta: { methodology }
        },
    },
    allowNegativeValue: true // AS protocol revenue is tracked when collected, and interest can be lower for a day when collected
}

export default adapters;