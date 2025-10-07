import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface AccountModifierRecord {
	user: string,
	takerFeeDiscount: number,
	feeRebate: number,
	fromBlock: number,
}

interface DefaultModifierRecord {
	fromBlock: number,
	takerFeeDiscount: number,
	feeRebate: number,
}

// Certain accounts were granted special fee modifiers
// Account modifiers contract: 0x6927d2026BefAAd51eB6Cf48A0C612453F46eC09  
const AccountModifiers: AccountModifierRecord[] = [
	{
		user: "0xb0C8851D241285F78a8ca7f97bb09252d2387552",
		takerFeeDiscount: 50,
		feeRebate: 50,
		fromBlock: 4646689,
	},
	{
		user: "0xF10488e5C0214001ccF5479AB62F437006d49d00",
		takerFeeDiscount: 100,
		feeRebate: 100,
		fromBlock: 4667712,
	},
	{
		user: "0x67422ED6742cEEE17dB28ef0E3230261c1D1f47c",
		takerFeeDiscount: 100,
		feeRebate: 100,
		fromBlock: 4667722,
	},
	{
		user: "0x139F74f0d8A5ca94c269D5c3E3c453D3385ceA49",
		takerFeeDiscount: 100,
		feeRebate: 100,
		fromBlock: 4667739,
	},
	{
		user: "0x3b19F71B8cA2eac636e0EaFE264A865Bd5467DF6",
		takerFeeDiscount: 100,
		feeRebate: 100,
		fromBlock: 4722361,
	}, 
	{
		user: "0x0C35303Acf2c11316F4664dADda30Fe0fa682768",
		takerFeeDiscount: 100,
		feeRebate: 100,
		fromBlock: 4722361,
	}
]

// Default fee modifiers were applied to all users
const DefaultModifiers: DefaultModifierRecord[] = [
	{
		fromBlock: 4257315,
		takerFeeDiscount: 100,
		feeRebate: 0,
	},
	{
		fromBlock: 4328554,
		takerFeeDiscount: 0,
		feeRebate: 100,
	},
	{
		fromBlock: 4479823,
		takerFeeDiscount: 0,
		feeRebate: 0,
	},
	{
		fromBlock: 5339045,
		takerFeeDiscount: 90,
		feeRebate: 0,
	},
	{
		fromBlock: 5534354,
		takerFeeDiscount: 0,
		feeRebate: 0,
	},
]

const tokenStore = "0x1cE7AE555139c5EF5A57CC8d814a867ee6Ee33D8"

export const fetch = async (options: FetchOptions) => {
	const dailyVolume = options.createBalances()
	const dailyFees = options.createBalances()

	const trades = await options.getLogs({
		target: tokenStore,
		eventAbi: 'event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give, uint nonce)',
		onlyArgs: false,
	})

	// The global fee value was never changed by the owner: 0x44a93F553Bd529c19386b2DDfA30F458B0bc3B20
	const feePercentage = await options.api.call({
		target: tokenStore,
		abi: 'function fee() view returns (uint256)'
	})

	trades.forEach((trade: any) => {
		dailyVolume.add(trade.args.tokenGet, trade.args.amountGet)

		// Fee is paid in the tokenGet (amountGet)
		const feeTakeValue = (BigInt(trade.args.amountGet) * BigInt(feePercentage)) / BigInt(1e18)

		let makerAccountRebate = 0
		let takerAccountDiscount = 0
		let defaultDiscount = 0
		let defaultRebate = 0

		// Check if the user (_caller/Give/Taker) has a discount modifier
		const giveAccountMod = AccountModifiers.find(mod => mod.user.toLowerCase() === trade.args.give.toLowerCase() && mod.fromBlock <= trade.blockNumber)
		if (giveAccountMod) takerAccountDiscount = giveAccountMod.takerFeeDiscount

		// Check if the user (_user/Get/Maker) has a rebate modifier
		const getAccountMod = AccountModifiers.find(mod => mod.user.toLowerCase() === trade.args.get.toLowerCase() && mod.fromBlock <= trade.blockNumber)
		if (getAccountMod) makerAccountRebate = getAccountMod.feeRebate

		const defaultMod = DefaultModifiers.find((mod, i) => {
			const nextBlock = DefaultModifiers[i + 1]?.fromBlock || Infinity
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

	return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
	methodology: {
		Volume: "Trading volume across all pairs on TokenStore.",
		Fees: 'Users pay fees on each swap.',
		Revenue: 'The protocol earns revenue from trading fees.',
		ProtocolRevenue: 'The protocol earns revenue from trading fees.',
	},
	version: 2,
	fetch,
	chains: [CHAIN.ETHEREUM],
}

export default adapter
