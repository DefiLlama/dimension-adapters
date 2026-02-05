import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { nullAddress } from "../helpers/token";

// Found by looking at contracts deployed by 0xa8863bf1c8933f649e7b03eb72109e5e187505ea
// Yes, i manually checked hundreds of txs T_T

const CREATE2_CONTRACTS = ["0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e", "0x04ba6cf3c5aa6d4946f5b7f7adf111012a9fac65", "0x23aa05a271debffaa3d75739af5581f744b326e4", "0x26bbea7803dcac346d5f5f135b57cf2c752a02be", "0xfc29813beeb3c7395c7a5f8dfc3352491d5ea0e2"]
const contracts: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: ["0x3b8c2feb0f4953870f825df64322ec967aa26b8c", "0xDb8d79C775452a3929b86ac5DEaB3e9d38e1c006", ...CREATE2_CONTRACTS], // missing old burn redeem and erc721 burn redeem
    [CHAIN.OPTIMISM]: CREATE2_CONTRACTS,
    [CHAIN.BASE]: CREATE2_CONTRACTS,
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const pre = await options.fromApi.sumTokens({
        token: nullAddress,
        owners: contracts[options.chain]
    })
    const post = await options.toApi.sumTokens({
        token: nullAddress,
        owners: contracts[options.chain]
    }) as any
    const dailyFees = options.createBalances();
    dailyFees.addBalances(post)
    dailyFees.subtract(pre)
    if (Number(Object.values(dailyFees.getBalances())[0]) < 0) {
        /*
        When a new NFT is minted, a fee gets paid, the fee changes based on whether the NFT was minted with no whitelist or with a merkle whitelist
        However there's no event emitted that can be used to differentiate those two cases, so its impossible to track exact fees via events, only upper and lower bounds
        Because of that, the best way to track fees would be to track the difference in ETH balance for the contract and then subtract any withdrawal from the team
        But withdrawals don't emit any event
        So, given that withdrawals are very rare, what we do is just track the balance difference and when there's a withdrawal we fetch from traces
        */
        // const nativeTransfers = await queryDuneSql(options, `select sum(value) as withdrawn from 
        //     CHAIN.traces
        //     where "from" IN (${contracts[options.chain].join(', ')})
        //     AND to IN (0x93fd235c56964e0ffb49229e8d642c3fd81310a5, 
        //     0xfa0f022aac5a1fd99094df8aadb947ce08f79d5b, 0x3a0079197027d80c260f8cd482210fdc48ec51e5, 
        //     0x267bfe2905dccec10cb22115ca1d0b1da11ddad5)
        //     AND success = TRUE
        //     AND TIME_RANGE`)
        const nativeTransfers = await queryAllium(`
          SELECT SUM(value) as withdrawn
          FROM ${options.chain}.raw.traces
          WHERE from_address IN (${contracts[options.chain].map((a: string) => `'${a.toLowerCase()}'`).join(', ')})
          AND to_address IN ('0x93fd235c56964e0ffb49229e8d642c3fd81310a5', '0xfa0f022aac5a1fd99094df8aadb947ce08f79d5b', '0x3a0079197027d80c260f8cd482210fdc48ec51e5', '0x267bfe2905dccec10cb22115ca1d0b1da11ddad5')
          AND status = 1
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        `)

        dailyFees.add(nullAddress, nativeTransfers[0].withdrawn)
    }

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: Object.keys(contracts),
    dependencies: [Dependencies.ALLIUM],
    allowNegativeValue: true, // allow as there is specific case, from fetch function comment
    methodology: {
        Fees: 'Fees paid by users for creating and publishing NFT.',
        Revenue: 'All fees collected by Manifold protocol.',
    },
}

export default adapter;