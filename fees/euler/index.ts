import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

const UINT256_MAX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const eVaultFactories: Record<string, string> = {
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
    [CHAIN.PLASMA]: "0x42388213C6F56D7E1477632b58Ae6Bba9adeEeA3",
    [CHAIN.MANTLE]: "0x47Aaf2f062aa1D55AFa602f5C9597588f71E2d76",
};

const feeFlowControllers: Record<string, string> = {
    [CHAIN.ETHEREUM]: "0xFcd3Db06EA814eB21C84304fC7F90798C00D1e32",
    [CHAIN.BSC]: "0xE7Ef8C7CcB6aa81e366f0A0ccd89A298d9893E83",
    [CHAIN.UNICHAIN]: "0x87BeecC6B609723B2Ef071c20AA756846969240C",
    [CHAIN.SONIC]: "0xD3Cf3Ec3D7849F2C7Bb9Ff5a8662Ae36a177bEb8",
    [CHAIN.TAC]: "0x9128754f3951a819528d110f3a92a2586D352463",
    [CHAIN.HYPERLIQUID]: "0x8916311B5E8056E0709163c52a51831A0f152b44",
    [CHAIN.SWELLCHAIN]: "0xA93Ff8C4CC2Ba56Ee182B70bb07F2C75DA249879",
    [CHAIN.BASE]: "0xbF4906E2F20362c3d746F7eFfF54abB8282902ed",
    [CHAIN.PLASMA]: "0xBCc714F3ce3F56aB4A85a10d593cF9C93ED6ED9e",
    [CHAIN.ARBITRUM]: "0xA1585dc7Cd4EF33f7a855fDE39771b37838B0bFE",
    [CHAIN.AVAX]: "0x95F21cD90057BBdC6fAc3f9b94D06b53C24B278c",
    [CHAIN.LINEA]: "0xbF939812A673CB088f466d610c4b120b13eA5fAB",
    [CHAIN.BOB]: "0xcb3c0D131C64265099868F847face425499785A8",
    [CHAIN.BERACHAIN]: "0x5EAe58dc72E4E374F32eCA2751cC38b573dd82c9",
};

const tokenEUL: Record<string, string> = {
    [CHAIN.ETHEREUM]: "0xd9fcd98c322942075a5c3860693e9f4f03aae07b",
    [CHAIN.BSC]: "0x2117e8b79e8e176a670c9fcf945d4348556bffad",
    [CHAIN.UNICHAIN]: "0xE9C43e09C5FA733bCC2aEAa96063A4a60147AA09",
    [CHAIN.SONIC]: "0x8e15C8D399e86d4FD7B427D42f06c60cDD9397e7",
    [CHAIN.TAC]: "0x38C043856A109066d64a60c82e07848a1C58e7Dc",
    [CHAIN.HYPERLIQUID]: "0x3A41f426E55ECdE4BC734fA79ccE991b94aFf711",
    [CHAIN.SWELLCHAIN]: "0x80ccFBec4b8c82265abdc226Ad3Df84C0726E7A3",
    [CHAIN.BASE]: "0xa153Ad732F831a79b5575Fa02e793EC4E99181b0",
    [CHAIN.PLASMA]: "0xca632FA58397391C750c13F935DAA61AbBe0BaA6",
    [CHAIN.ARBITRUM]: "0x462cD9E0247b2e63831c3189aE738E5E9a5a4b64",
    [CHAIN.AVAX]: "0x9ceeD3A7f753608372eeAb300486cc7c2F38AC68",
    [CHAIN.LINEA]: "0x3eBd0148BADAb9388936E4472C4415D5700478A5",
    [CHAIN.BOB]: "0xDe1763aFA5eB658CfFFfD16835AfeB47e7aC0B8D",
    [CHAIN.BERACHAIN]: "0xEb9b5f4EB023aE754fF59A04c9C038D58606DAC6",
}

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

    // buy back EUL
    const dailyHoldersRevenue = options.createBalances()
    if (feeFlowControllers[options.chain]) {
        const buyEvents = await options.getLogs({
            target: feeFlowControllers[options.chain],
            eventAbi: 'event Buy(address indexed buyer, address indexed assetsReceiver, uint256 paymentAmount)',
        })
        for (const buyEvent of buyEvents) {
            dailyHoldersRevenue.add(tokenEUL[options.chain], buyEvent.paymentAmount, METRIC.TOKEN_BUY_BACK)

            // don't add holder revenue to dailyFees
            // because, fees collected from one day, buy back back happend on days later
        }
    }

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    }
}

const info = {
    methodology: {
        Fees: "Interest that is paid by the borrowers to the vaults.",
        Revenue: "Fees collected by vaults owners, curators, and Euler.",
        ProtocolRevenue: "Fees share collected by Euler protocol.",
        SupplySideRevenue: "Fees distributed to vaults lenders.",
        HoldersRevenue: "Revenue used for buy back EUL tokens.",
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
        HoldersRevenue: {
            [METRIC.TOKEN_BUY_BACK]: 'Revenue used for buy back EUL tokens.',
        },
    }
}
 // first vault created
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
            start: '2025-08-11',
        },
        [CHAIN.PLASMA]: {
            fetch,
            start: '2025-09-22',
        },
        // [CHAIN.MANTLE]: {
        //     fetch,
        //     start: '2025-08-11', // no vaults created
        // },
    },
}

export default adapters;