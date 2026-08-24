import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists"

const FeeCollectedEvent = "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)"
const FeesForwardedEvent = "event FeesForwarded(address indexed token, (address recipient, uint256 amount)[] fees)"

// Around 2026-04-10 LI.FI retired the per-chain FeeCollector contracts (FeesCollected) in favour of
// a fee router that emits FeesForwarded with the full recipient split, and on 2026-08-20 the router
// moved again, deployed at the same address on every chain. All are read so refills stay correct
// across the migrations: each event source stops emitting after its successor starts.
const FeeRouters: Record<string, string> = {
	[CHAIN.ETHEREUM]: '0x685527c551cc40ce1f1c9818cd8683307076e4ed',
}
const DefaultFeeRouter = '0xc18d9e84b8687a2645447a61e52c455dac1675e1'
const FeeRouter2608 = '0xce40449b773a3e6e5e769adb4e567179d4828cbd'

// LI.FI's own share of a FeesForwarded payout; every other recipient is an integrator. Verified as
// the one recipient present on all 21 chains that had payouts on 2026-07-23.
const LifiRecipient = '0xc06ebbefd94032b85424d51906e2a335efae264b'

const IntegratorFee = 'Integration & Partnership Fees'
const LifiProtocolFee = 'LiFi Fees'

const fetch = async (options: FetchOptions) => {
	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();
	const dailySupplySideRevenue = options.createBalances();

	// 0x0000000000000000000000000000000000000000 is the gas token for all chains, we already handle it in the Balances
	const blacklistForChain = new Set(DefaultDexTokensBlacklisted[options.chain]);

	const addFee = (token: string, amount: any, isLifi: boolean) => {
		if (blacklistForChain.has(token.toLowerCase())) return;
		const label = isLifi ? LifiProtocolFee : IntegratorFee;
		dailyFees.add(token, amount, label);
		(isLifi ? dailyRevenue : dailySupplySideRevenue).add(token, amount, label);
	};

	const legacy: any[] = await options.getLogs({
		target: LifiFeeCollectors[options.chain].id,
		eventAbi: FeeCollectedEvent,
	});
	legacy.forEach((log: any) => {
		addFee(log._token, log._integratorFee, false);
		addFee(log._token, log._lifiFee, true);
	});

	const forwarded: any[] = await options.getLogs({
		targets: [FeeRouters[options.chain] ?? DefaultFeeRouter, FeeRouter2608],
		eventAbi: FeesForwardedEvent,
	});
	forwarded.forEach((log: any) => {
		log.fees.forEach((fee: any) => {
			addFee(log.token, fee.amount, String(fee.recipient).toLowerCase() === LifiRecipient);
		});
	});

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
		dailySupplySideRevenue,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	// pullHourly: true,
	fetch,
	adapter: LifiFeeCollectors,
	methodology: {
		Fees: 'All fees paid by users for swap and bridge tokens via LI.FI.',
		Revenue: 'Fees are collected by LI.FI protocol.',
		ProtocolRevenue: 'Fees are collected by LI.FI protocol.',
		SupplySideRevenue: 'Fees are distributed to LI.FI and intergations and partnerships.',
	},
	breakdownMethodology: {
		Fees: {
			[LifiProtocolFee]: 'Fees share for LI.FI protocol.',
			[IntegratorFee]: 'Fees are distributed to LI.FI and intergations and partnerships.',
		},
		Revenue: {
			[LifiProtocolFee]: 'Fees share for LI.FI protocol.',
		},
		ProtocolRevenue: {
			[LifiProtocolFee]: 'Fees share for LI.FI protocol.',
		},
		SupplySideRevenue: {
			[IntegratorFee]: 'Fees are distributed to LI.FI and intergations and partnerships.',
		},
	}
};

export default adapter;
