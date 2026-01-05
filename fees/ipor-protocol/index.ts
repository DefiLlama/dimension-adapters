import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";

const IPOR_GITHUB_ADDRESSES_URL = "https://raw.githubusercontent.com/IPOR-Labs/ipor-abi/refs/heads/main/mainnet/addresses.json";

const eventAbis = {
    managementFee: "event ManagementFeeRealized(uint256 unrealizedFeeInUnderlying, uint256 unrealizedFeeInShares)",
}

const methodology = {
    Fees: 'Management fees are included in event logs emitted by each vault contract.',
    Revenue: 'Total fees collected by the protocol.',
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()

    const config = await getConfig('ipor/assets', IPOR_GITHUB_ADDRESSES_URL);
    const chainConfig = config[options.chain];
    if (!chainConfig || !chainConfig.vaults) {
        return { dailyFees, dailyRevenue };
    }

    const vaults = chainConfig.vaults.map((vault: any) => vault.PlasmaVault);

    const logs = await options.api.getLogs({
        targets: vaults,
        eventAbi: eventAbis.managementFee,
        fromBlock: await options.getFromBlock(),
        toBlock: await options.getToBlock(),
    })

    // Call asset() for each vault to get underlying tokens
    const assetCalls = await options.api.multiCall({
        abi: 'function asset() view returns (address)',
        calls: vaults,
        permitFailure: true,
    })

    const vaultToToken: Record<string, string> = {}
    vaults.forEach((v: string, i: number) => {
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

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "9-29-2024",
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: "9-3-2024",
        },
        [CHAIN.BASE]: {
            fetch,
            start: "11-8-2024",
        },
        [CHAIN.UNICHAIN]: {
            fetch,
            start: "6-18-2025",
        },
        [CHAIN.TAC]: {
            fetch,
            start: "7-11-2025",
        },
    },
    methodology
}

export default adapter;