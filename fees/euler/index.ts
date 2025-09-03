import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

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
    [CHAIN.TAC]: "0x2b21621b8Ef1406699a99071ce04ec14cCd50677",
    [CHAIN.LINEA]: "0x84711986Fd3BF0bFe4a8e6d7f4E22E67f7f27F04",
};


const eulerFactoryABI = {
    vaultLength: "function getProxyListLength() view returns (uint256)",
    getProxyListSlice: "function getProxyListSlice(uint256 start, uint256 end) view returns (address[] list)",
}

const eulerVaultABI = {
    asset: "function asset() view returns (address)",
    decimals: "function decimals() view returns (uint8)",
    totalAssets: "function totalAssets() view returns (uint256)",
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
    interestFee: 'uint256:interestFee',
    protocolFeeShare: 'uint256:protocolFeeShare',
}

const fetch = async (options: FetchOptions) => {
    // return await getVaults(options)

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()

    // get vaults list from factories
    const vaults = await options.fromApi.call({ target: eVaultFactories[options.chain], abi: eulerFactoryABI.getProxyListSlice, params: [0, UINT256_MAX] })

    // get vaults info
    const vaultAssets = (await options.fromApi.multiCall({ calls: vaults, abi: eulerVaultABI.asset }))
        .map(asset => asset ? asset : ADDRESSES.null)
    const vaultBalances = await options.fromApi.multiCall({
        abi: eulerVaultABI.totalAssets,
        calls: vaults
    })
    const vaultInterestFees = await options.fromApi.multiCall({
        abi: eulerVaultABI.interestFee,
        calls: vaults
    })
    const vaultProtocolFeeShares = await options.fromApi.multiCall({
        abi: eulerVaultABI.protocolFeeShare,
        calls: vaults
    })

    const convertToAssetsBefore = await options.fromApi.multiCall({
        abi: eulerVaultABI.convertToAssets,
        calls: vaults.map((vaultAddress: string, index: number) => {
            return {
                target: vaultAddress,
                params: [String(1e18)],
            }
        })
    })
    const convertToAssetsAfter = await options.toApi.multiCall({
        abi: eulerVaultABI.convertToAssets,
        calls: vaults.map((vaultAddress: string, index: number) => {
            return {
                target: vaultAddress,
                params: [String(1e18)],
            }
        })
    })

    for (let i = 0; i < vaults.length; i++) {
        const balance = vaultBalances[i] ? vaultBalances[i] : 0
        const interestFee = vaultInterestFees[i] ? vaultInterestFees[i] : 0
        const protocolFeeShare = vaultProtocolFeeShares[i] ? vaultProtocolFeeShares[i] : 0

        const growthAssets = Number(convertToAssetsAfter[i]) - Number(convertToAssetsBefore[i])
        const interestEarned = BigInt(growthAssets) * BigInt(balance) / BigInt(1e18)

        let interestEarnedBeforeFee = interestEarned
        if (interestFee < BigInt(1e4)) {
            interestEarnedBeforeFee = interestEarned * BigInt(1e4) / (BigInt(1e4) - BigInt(interestFee))
        }

        const protocolRevenueShare = (interestEarnedBeforeFee - interestEarned) * BigInt(protocolFeeShare) / BigInt(1e4)

        dailyFees.add(vaultAssets[i], interestEarnedBeforeFee, METRIC.BORROW_INTEREST);
        dailyRevenue.add(vaultAssets[i], interestEarnedBeforeFee - interestEarned, METRIC.BORROW_INTEREST)
        dailyProtocolRevenue.add(vaultAssets[i], protocolRevenueShare, METRIC.BORROW_INTEREST)
    }

    const dailySupplySideRevenue = dailyFees.clone()
    dailySupplySideRevenue.subtract(dailyRevenue)

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
    }
}

const info = {
    methodology: {
        Fees: "Interest that is paid by the borrowers to the vaults.",
        Revenue: "Fees collected by vaults owners, curators, and Euler.",
        ProtocolRevenue: "Fees share collected by Euler protocol.",
        SupplySideRevenue: "Fees distributed to vaults lenders.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all vaults.',
        },
        Revenue: {
            [METRIC.BORROW_INTEREST]: 'A portion of interest were charged and distributed to vaults curators, owenrs, deployers and Euler protocol.',
        },
        SupplySideRevenue: {
            [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all vaults.',
        },
        ProtocolRevenue: {
            [METRIC.BORROW_INTEREST]: 'Amount of interest are collected by Euler protocol.',
        },
    }
}

const adapters: Adapter = {
    version: 2,
    methodology: info.methodology,
    breakdownMethodology: info.breakdownMethodology,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2024-08-18',
        },
        [CHAIN.SONIC]: {
            fetch,
            start: '2025-01-31',
        },
        [CHAIN.BASE]: {
            fetch,
            start: '2024-11-27',
        },
        [CHAIN.SWELLCHAIN]: {
            fetch,
            start: '2025-01-20',
        },
        [CHAIN.BOB]: {
            fetch,
            start: '2025-01-21',
        },
        [CHAIN.BERACHAIN]: {
            fetch,
            start: '2025-02-06',
        },
        [CHAIN.BSC]: {
            fetch,
            start: '2025-02-04',
        },
        [CHAIN.UNICHAIN]: {
            fetch,
            start: '2025-02-11',
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2025-01-30',
        },
        [CHAIN.AVAX]: {
            fetch,
            start: '2025-02-04',
        },
        [CHAIN.TAC]: {
            fetch,
            start: '2025-06-21',
        },
        [CHAIN.LINEA]: {
            fetch,
            start: '2025-08-11', // first vault created
        },
    },
}

export default adapters;