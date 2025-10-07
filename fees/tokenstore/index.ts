import { FetchResultV2, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { accountModifiers, defaultModifiers } from "./config";

const tokenStore = "0x1cE7AE555139c5EF5A57CC8d814a867ee6Ee33D8"

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {

    const dailyFees = options.createBalances()

    const trades = await options.api.getLogs({
        target: tokenStore,
        eventAbi: 'event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give, uint nonce)',
        fromBlock: await options.getFromBlock(),
        toBlock: await options.getToBlock(),
    })
    if (trades.length === 0) return { dailyFees, dailyRevenue: dailyFees }

    // The global fee value was never changed by the owner: 0x44a93F553Bd529c19386b2DDfA30F458B0bc3B20
    const feePercentage = await options.api.call({
        target: tokenStore,
        abi: 'function fee() view returns (uint256)'
    })

    // Apply fees to each trade while accounting for any fee modifiers
    trades.forEach((trade: any) => {
        // Fee is paid in the tokenGet (amountGet)
        const feeTakeValue = (BigInt(trade.args.amountGet) * BigInt(feePercentage)) / BigInt(1e18)

        let makerAccountRebate = 0
        let takerAccountDiscount = 0
        let defaultDiscount = 0
        let defaultRebate = 0

        // Check if the user (_caller/Give/Taker) has a discount modifier
        const giveAccountMod = accountModifiers.find(
            mod => mod.user.toLowerCase() === trade.args.give.toLowerCase() &&
                mod.fromBlock <= trade.blockNumber
        )
        if (giveAccountMod) takerAccountDiscount = giveAccountMod.takerFeeDiscount

        // Check if the user (_user/Get/Maker) has a rebate modifier
        const getAccountMod = accountModifiers.find(
            mod => mod.user.toLowerCase() === trade.args.get.toLowerCase() &&
                mod.fromBlock <= trade.blockNumber
        )
        if (getAccountMod) makerAccountRebate = getAccountMod.feeRebate

        const defaultMod = defaultModifiers.find((mod, i) => {
            const nextBlock = defaultModifiers[i + 1]?.fromBlock || Infinity
            return mod.fromBlock <= trade.blockNumber && trade.blockNumber < nextBlock
        })
        if (defaultMod) {
            defaultDiscount = defaultMod.takerFeeDiscount
            defaultRebate = defaultMod.feeRebate
        }

        // The larger of the two values is always applied when comparing default vs account-specific modifiers
        const discount = Math.max(defaultDiscount, takerAccountDiscount)
        const rebate = Math.max(defaultRebate, makerAccountRebate)

        // First apply discount
        let fee = feeTakeValue
        fee = (fee * BigInt(100 - discount)) / BigInt(100)

        // Then apply rebate
        const rebateValue = (fee * BigInt(rebate)) / BigInt(100)
        const protocolFee = fee - rebateValue

        dailyFees.add(trade.args.tokenGet, protocolFee)
    })

    return { dailyFees, dailyRevenue: dailyFees }
}


const adapter: SimpleAdapter = {
    methodology: {
        Fees: 'Users pay fees on each swap.',
        Revenue: 'The protocol earns revenue from trading fees.',
    },
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
        },
    },
};

export default adapter;