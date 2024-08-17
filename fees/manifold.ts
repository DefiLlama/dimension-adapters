import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { nullAddress } from "../helpers/token";

// Found by looking at contracts deployed by 0xa8863bf1c8933f649e7b03eb72109e5e187505ea
// Yes, i manually checked hundreds of txs T_T

const CREATE2_CONTRACTS = ["0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e", "0x04ba6cf3c5aa6d4946f5b7f7adf111012a9fac65", "0x23aa05a271debffaa3d75739af5581f744b326e4", "0x26bbea7803dcac346d5f5f135b57cf2c752a02be"]
const contracts = {
    ethereum: ["0x3b8c2feb0f4953870f825df64322ec967aa26b8c", "0xDb8d79C775452a3929b86ac5DEaB3e9d38e1c006", "0x26bbea7803dcac346d5f5f135b57cf2c752a02be", "0x23aa05a271debffaa3d75739af5581f744b326e4"],
    optimism: CREATE2_CONTRACTS,
    base: CREATE2_CONTRACTS,
    
} as any


const evm = async ({ fromApi, toApi, chain, createBalances }: FetchOptions) => {
    const pre = await fromApi.sumTokens({
        token: nullAddress,
        owners: contracts[chain]
    })
    const post = await toApi.sumTokens({
        token: nullAddress,
        owners: contracts[chain]
    }) as any
    const dailyFees = createBalances();
    dailyFees.addBalances(post)
    dailyFees.subtract(pre)
    if(Object.values(dailyFees)[0]<0){
        /*
        When a new NFT is minted, a fee gets paid, the fee changes based on whether the NFT was minted with no whitelist or with a merkle whitelist
        However there's no event emitted that can be used to differentiate those two cases, so its impossible to track exact fees via events, only upper and lower bounds
        Because of that, the best way to track fees would be to track the difference in ETH balance for the contract and then subtract any withdrawal from the team
        But withdrawals don't emit any event
        So, given that withdrawals are very rare, what we do is just track the balance difference and when there's a withdrawal we error out so no data is produced
        */
        throw new Error("negative rev")
    }

    return {
        dailyFees: dailyFees,
        dailyRevenue: dailyFees,
    }
}

const adapter: Adapter = {
    version: 2,
    isExpensiveAdapter: true,
    adapter: Object.keys(contracts).reduce((all, chain) => ({
        ...all,
        [chain]: {
            fetch: evm,
            start: 0,
        }
    }), {})
}

export default adapter;