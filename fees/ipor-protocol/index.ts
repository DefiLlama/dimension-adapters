import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const vaultsPerChain: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
        "0x20e934c725b6703f0aC696F1689008057dB9Ac44", // IPOR DAI Ethereum
        "0x43Ee0243eA8CF02f7087d8B16C8D2007CC9c7cA2", // IPOR USDC Ethereum
        "0xAbAb980f0eCB232D52f422C6B68D25C3d0c18E3e", // IPOR USDT Ethereum
        "0xf6cD9E8415162C8fb3C52676c7cA68812A34f76E", // Resevoir ETH Yield
        "0xe9385eFf3F937FcB0f0085Da9A3F53D6C2B4fB5F", // Resevoir srUSD Looping Ethereum
        "0xa435F140114910C96343574DD67883F7538ba736", // yUSD Loooper
        "0xE47358eae04719f3CF7025E95d0AD202e68BD9b2", // Resevoir BTC Yield
        "0xB0f56BB0bf13ee05FeF8cD2d8DF5FfdFcAC7a74f", // TAU InfiniFI Pointsmax
        "0x6f66b845604dad6E80b2A1472e6cAcbbE66A8C40", // TAU Resevoir Pointsmax
        "0x43a32D4f6c582f281c52393f8F9E5AcE1D4A1E68", // TAU Yield Bond ETF
        "0xD731F94c778f7C1090e2E0D797150A647De5188A", // Strata-Money PTs Looping Ethereum
    ],
    [CHAIN.ARBITRUM]: [
        "0xa91267A25939b2B0f046013fbF9597008F7F014b", // IporPlasmaVaultUsdc 
        "0xcafC0A559a9Bf2fc77a7ECFaF04BD929a7D9c5Cf", // Singularity Vault - USDC
        "0x407D3d942d0911a2fEA7E22417f81E27c02D6c6F", // Autopilot USDC Drip
        "0x4c4f752fa54dafB6d51B4A39018271c90bA1156F", // LlamaRisk crvUSD Optimizer
    ],
    [CHAIN.UNICHAIN]: [
        "0x2aF2146E6722B80A0A455F405eDFF3993715E417", // K3 Capital ETH Maxi 
    ],
    [CHAIN.TAC]: [
        "0x754bed7C83FB9bc172df86e606be7baC8bD69357", // gForce Vault
    ],
    [CHAIN.BASE]: [
        "0x45aa96f0b3188D47a1DaFdbefCE1db6B37f58216", // IPOR USDC Base
        "0xC4C00d8b323f37527eEda27c87412378be9F68Ec", // IPOR wstETH Base
        "0xEbc6C7883CA32EF9484740BA32A816F5F88B7A41", // Tanken WETH Base
        "0xf2F8386B88CB15c5CeaDE069c44f57fd2fD35E95", // Clearstar Core USDC
        "0xfd843a3D9329C91CA22c5daA994BeA762541F954", // yoETH Loooper
        "0x1166250D1d6B5a1DBb73526257f6bb2Bbe235295", // yoUSDC Loooper
        "0x31A421271414641cb5063B71594b642D2666dB6B", // Autopilot cbBTC Base
        "0x0d877Dc7C8Fa3aD980DfDb18B48eC9F8768359C4", // Autopilot USDC Base
        "0x7872893e528Fe2c0829e405960db5B742112aa97", // Autopilot WETH Base
    ],
}

const eventAbis = {
    managementFee: "event ManagementFeeRealized(uint256 unrealizedFeeInUnderlying, uint256 unrealizedFeeInShares)",
}

const methodology = {
    Fees: 'Management fees collected by the protocol are included in event logs emitted by each vault contract.',
    Revenue: 'Total fees collected by the protocol.',
}

const fetch = (vaults: string[]) => {
    return async (options: FetchOptions) => {
        const dailyFees = options.createBalances()
        const dailyRevenue = options.createBalances()

        const logs = await options.api.getLogs({
            targets: vaults,
            eventAbi: eventAbis.managementFee,
            fromBlock: await options.getFromBlock(),
            toBlock: await options.getToBlock(),
        })

        // Call asset() for each vault to get underlying tokens
        const assetCalls = await options.api.multiCall({
            abi: 'function asset() view returns (address)',
            calls: vaults.map(v => ({ target: v })),
            permitFailure: true,
        })

        const vaultToToken: Record<string, string> = {}
        vaults.forEach((v, i) => {
            if (assetCalls[i]) {
                vaultToToken[v.toLowerCase()] = assetCalls[i]
            }
        })

        logs.forEach((log: any) => {
            const token = vaultToToken[log.address.toLowerCase()]
            if (token) {
                dailyFees.add(token, log.args[0])
                dailyRevenue.add(token, log.args[0])
            }
        })

        return { dailyFees, dailyRevenue }
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch(vaultsPerChain[CHAIN.ETHEREUM]),
            start: "9-29-2024",
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch(vaultsPerChain[CHAIN.ARBITRUM]),
            start: "9-3-2024",
        },
        [CHAIN.BASE]: {
            fetch: fetch(vaultsPerChain[CHAIN.BASE]),
            start: "11-8-2024",
        },
        [CHAIN.UNICHAIN]: {
            fetch: fetch(vaultsPerChain[CHAIN.UNICHAIN]),
            start: "6-18-2025",
        },
        [CHAIN.TAC]: {
            fetch: fetch(vaultsPerChain[CHAIN.TAC]),
            start: "7-11-2025",
        },
    },
    methodology
}

export default adapter;