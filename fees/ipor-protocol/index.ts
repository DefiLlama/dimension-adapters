import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Vaults & token mappings per chain
const vaultsPerChain: Record<string, { vault: string, token: string }[]> = {
    [CHAIN.ETHEREUM]: [
        { vault: "0x20e934c725b6703f0aC696F1689008057dB9Ac44", token: ADDRESSES.ethereum.DAI }, // IPOR DAI Ethereum
        { vault: "0x43Ee0243eA8CF02f7087d8B16C8D2007CC9c7cA2", token: ADDRESSES.ethereum.USDC }, // IPOR USDC Ethereum
        { vault: "0xAbAb980f0eCB232D52f422C6B68D25C3d0c18E3e", token: ADDRESSES.ethereum.USDT }, // IPOR USDT Ethereum
        { vault: "0xf6cD9E8415162C8fb3C52676c7cA68812A34f76E", token: ADDRESSES.ethereum.WETH }, // Resevoir ETH Yield
        { vault: "0xe9385eFf3F937FcB0f0085Da9A3F53D6C2B4fB5F", token: "0x09D4214C03D01F49544C0448DBE3A27f768F2b34" }, // Resevoir srUSD Looping Ethereum
        { vault: "0xa435F140114910C96343574DD67883F7538ba736", token: ADDRESSES.ethereum.USDC }, // yUSD Loooper
        { vault: "0xE47358eae04719f3CF7025E95d0AD202e68BD9b2", token: ADDRESSES.ethereum.WBTC }, // Resevoir BTC Yield
        { vault: "0xB0f56BB0bf13ee05FeF8cD2d8DF5FfdFcAC7a74f", token: ADDRESSES.ethereum.USDC }, // TAU InfiniFI Pointsmax
        { vault: "0x6f66b845604dad6E80b2A1472e6cAcbbE66A8C40", token: ADDRESSES.ethereum.USDC }, // TAU Resevoir Pointsmax
        { vault: "0x43a32D4f6c582f281c52393f8F9E5AcE1D4A1E68", token: ADDRESSES.ethereum.USDC }, // TAU Yield Bond ETF
        { vault: "0xD731F94c778f7C1090e2E0D797150A647De5188A", token: ADDRESSES.ethereum.USDe }, // Strata-Money PTs Looping Ethereum
    ],
    [CHAIN.ARBITRUM]: [
        { vault: "0xa91267A25939b2B0f046013fbF9597008F7F014b", token: ADDRESSES.arbitrum.USDC }, // IporPlasmaVaultUsdc 
        { vault: "0xcafC0A559a9Bf2fc77a7ECFaF04BD929a7D9c5Cf", token: ADDRESSES.arbitrum.USDC }, // Singularity Vault - USDC
        { vault: "0x407D3d942d0911a2fEA7E22417f81E27c02D6c6F", token: ADDRESSES.arbitrum.USDC }, // Autopilot USDC Drip
        { vault: "0x4c4f752fa54dafB6d51B4A39018271c90bA1156F", token: "0x498Bf2B1e120FeD3ad3D42EA2165E9b73f99C1e5" }, // LlamaRisk crvUSD Optimizer
    ],
    [CHAIN.UNICHAIN]: [
        { vault: "0x2aF2146E6722B80A0A455F405eDFF3993715E417", token: ADDRESSES.unichain.WETH }, // K3 Capital ETH Maxi 
    ],
    [CHAIN.TAC]: [
        { vault: "0x754bed7C83FB9bc172df86e606be7baC8bD69357", token: ADDRESSES.tac.WTAC }, // gForce Vault
    ],
    [CHAIN.BASE]: [
        { vault: "0x45aa96f0b3188D47a1DaFdbefCE1db6B37f58216", token: ADDRESSES.base.USDC }, // IPOR USDC Base
        { vault: "0xC4C00d8b323f37527eEda27c87412378be9F68Ec", token: ADDRESSES.base.wstETH }, // IPOR wstETH Base
        { vault: "0xEbc6C7883CA32EF9484740BA32A816F5F88B7A41", token: ADDRESSES.base.WETH }, // Tanken WETH Base
        { vault: "0xf2F8386B88CB15c5CeaDE069c44f57fd2fD35E95", token: ADDRESSES.base.USDC }, // Clearstar Core USDC
        { vault: "0xfd843a3D9329C91CA22c5daA994BeA762541F954", token: ADDRESSES.base.WETH }, // yoETH Loooper
        { vault: "0x1166250D1d6B5a1DBb73526257f6bb2Bbe235295", token: ADDRESSES.base.USDC }, // yoUSDC Loooper
        { vault: "0x31A421271414641cb5063B71594b642D2666dB6B", token: ADDRESSES.base.cbBTC }, // Autopilot cbBTC Base
        { vault: "0x0d877Dc7C8Fa3aD980DfDb18B48eC9F8768359C4", token: ADDRESSES.base.USDC }, // Autopilot USDC Base
        { vault: "0x7872893e528Fe2c0829e405960db5B742112aa97", token: ADDRESSES.base.WETH }, // Autopilot WETH Base
    ],
}

const eventAbis = {
    managementFee: "event ManagementFeeRealized(uint256 unrealizedFeeInUnderlying, uint256 unrealizedFeeInShares)",
}

const methodology = {
    Fees: 'Management fees collected by the protocol are included in event logs emitted by each vault contract.',
    Revenue: 'Total fees collected by the protocol.',
}

const fetch = (vaultData: { vault: string, token: string }[]) => {
    return async (options: FetchOptions) => {
        const dailyFees = options.createBalances()
        const dailyRevenue = options.createBalances()

        const logs = await options.api.getLogs({
            targets: vaultData.map(v => v.vault),
            eventAbi: eventAbis.managementFee,
            fromBlock: await options.getFromBlock(),
            toBlock: await options.getToBlock(),
        })

        logs.forEach((log: any) => {
            const vaultInfo = vaultData.find(v => v.vault.toLowerCase() === log.address.toLowerCase())
            if (vaultInfo) {
                dailyFees.add(vaultInfo.token, log.args[0])
                dailyRevenue.add(vaultInfo.token, log.args[0])
            }
        })

        return { dailyFees, dailyRevenue }
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.fromEntries(
        Object.entries(vaultsPerChain).map(([chain, vaultData]) => [
            chain,
            { fetch: fetch(vaultData), start: 1704067200 }
        ])
    ),
    methodology
}

export default adapter;