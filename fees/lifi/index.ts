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

// The routers above are not deployed on every chain: LI.FI ships a chain-specific FeeForwarder to
// some of them, and on those chains both addresses have no bytecode at all, so the FeesForwarded
// leg reads nothing and fees publish as zero. Robinhood is the clearest case - 1,235 FeesForwarded
// in the last 50k blocks at its own forwarder, none at either address above. Both generations are
// listed for the same reason the older routers are still read: refills across a migration stay
// correct. source: https://github.com/lifinance/contracts/tree/main/deployments (FeeForwarder)
const ChainFeeForwarders: Record<string, string[]> = {
	[CHAIN.ABSTRACT]: ['0xA577ddDa8E06BE1a0705fE9c6e6Ce2D2011100c9', '0x973Be760B2992D7F01f0d66bEb48A172d10FB79a'],
	[CHAIN.BERACHAIN]: ['0xc431Ee11b784960CF6ed6a69f91B93fB565b4d44', '0x135566E8702A377D3F7Ec9f0a2bD8009901E8693'],
	[CHAIN.ERA]: ['0xA577ddDa8E06BE1a0705fE9c6e6Ce2D2011100c9', '0x92870bEd7554532ddE5213aC0f304573D79AaB24'],
	[CHAIN.FUSE]: ['0x79C3F5B651Ee5782Ba15d968B088458cd5f1f4EF'],
	[CHAIN.HEMI]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E'],
	[CHAIN.INK]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E'],
	[CHAIN.KATANA]: ['0xaaa55A0157670Ff2b4CF82F5cd2C754FE54BA574', '0x51586Ff93Ded33DbEb6D5fA68d046Fd036251D8A'],
	[CHAIN.LINEA]: ['0x72015d314542457cBB6BF14318d82464E4D413ec', '0xD8b700cEd3e486c3c4FC31Fc0c3b3590e1a52D7e'],
	[CHAIN.MANTLE]: ['0x79C3F5B651Ee5782Ba15d968B088458cd5f1f4EF'],
	[CHAIN.METIS]: ['0xF46B6684DF5D121D5FDD6cA76Ef4919c65887083', '0x531207ED256C75d26401aEd744333265E4b9029c'],
	[CHAIN.MONAD]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E'],
	[CHAIN.PLUME]: ['0xa2D39966793873f4514E5EcBDB0e1a84cAffa650', '0x32ca3c43c2807EbB7d82212BeeC31c1b7BaaD146'],
	[CHAIN.ROBINHOOD]: ['0xF4BFFE4dfC693f37715A47c15BdA8af9ed8f7Cf1', '0x4e0eb4c17A2Fc64f06314aFa4d3646241784ab3a'],
	[CHAIN.SONEIUM]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E'],
	[CHAIN.UNICHAIN]: ['0xA5971Bd73Dbb879aAaA6fEcB95Dc3fD50c2e3C25', '0xB401ccdA43C36935e6059C02103E9541FbA3337E'],
}

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

	// de-duplicated: on a few chains the chain-specific forwarder IS one of the shared addresses,
	// and passing it twice would count its logs twice.
	const forwarderTargets = [...new Set([
		FeeRouters[options.chain] ?? DefaultFeeRouter,
		FeeRouter2608,
		...(ChainFeeForwarders[options.chain] ?? []),
	].map((address) => address.toLowerCase()))];

	const forwarded: any[] = await options.getLogs({
		targets: forwarderTargets,
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
