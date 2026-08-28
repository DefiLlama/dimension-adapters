import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// https://docs.yeetit.xyz/yeet/yeetarded-products/yeet-bgt-auction
const TAX_SPLITTER = "0x93227c212b468B139e7D737525a736582F9FDC3F";
const PERCENTAGE_SCALE = 10000n;

const abis = {
	getRecipients: "address[]:getRecipients",
	getRecipientInfo: "function getRecipientInfo(address recipient) view returns (bool exists, uint256 percentage, string name)",
	FundsDistributed: "event FundsDistributed(uint256 totalAmount)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();
	const dailyProtocolRevenue = options.createBalances();
	const dailyHoldersRevenue = options.createBalances();
	const dailySupplySideRevenue = options.createBalances();

	const recipients: string[] = await options.api.call({ target: TAX_SPLITTER, abi: abis.getRecipients });
	const recipientInfos = await options.api.multiCall({
		target: TAX_SPLITTER,
		abi: abis.getRecipientInfo,
		calls: recipients,
	});

	// Each tax-splitter recipient is classified by its on-chain name:
	//   Treasury -> protocol revenue, Redacted -> YEET buyback (holders revenue),
	//   everything else (Bribes, YeetPrizeManager) -> supply side, paid back to participants.
	const recipientRoles = recipientInfos.map((info: any) => ({
		role: info.name.toLowerCase(),
		bps: BigInt(info.percentage),
	}));

	const logs = await options.getLogs({
		target: TAX_SPLITTER,
		eventAbi: abis.FundsDistributed,
	});

	logs.forEach((log) => {
		const amount = log.totalAmount;
		dailyFees.add(ADDRESSES.berachain.WBERA, amount, 'BGT Auction Fees');

		for (const { role, bps } of recipientRoles) {
			const share = amount * bps / PERCENTAGE_SCALE;
			if (role === "treasury") {
				dailyRevenue.add(ADDRESSES.berachain.WBERA, share, 'BGT Auction Fees To Protocol');
				dailyProtocolRevenue.add(ADDRESSES.berachain.WBERA, share, 'BGT Auction Fees To Protocol');
			} else if (role === "redacted") {
				dailyRevenue.add(ADDRESSES.berachain.WBERA, share, 'Token Buy Back');
				dailyHoldersRevenue.add(ADDRESSES.berachain.WBERA, share, 'Token Buy Back');
			} else if (role === "bribes") {
				dailySupplySideRevenue.add(ADDRESSES.berachain.WBERA, share, 'BGT Bribes');
			} else if (role === "yeetprizemanager") {
				dailySupplySideRevenue.add(ADDRESSES.berachain.WBERA, share, 'Prize Pool');
			}
		}
	});

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
		dailyHoldersRevenue,
		dailySupplySideRevenue,
	};
};

const adapter: Adapter = {
	version: 2,
	pullHourly: true,
	adapter: {
		[CHAIN.BERACHAIN]: {
			fetch,
			start: "2025-07-14",
		},
	},
	methodology: {
		Fees: "Total BERA bid into the BGT Auction and distributed by the tax splitter.",
		Revenue: "Protocol treasury + YEET buyback portion of auction bids.",
		ProtocolRevenue: "Portion of auction bids retained by the Yeet protocol treasury.",
		HoldersRevenue: "Portion of auction bids used for YEET buyback and burn via the Yeetarded Buyback Vault.",
		SupplySideRevenue: "Portion of auction bids paid out as BGT bribes (reward vault) and prize pool to auction participants.",
	},
	breakdownMethodology: {
		Fees: {
			'BGT Auction Fees': 'Total BERA bid into the BGT Auction and distributed by the tax splitter.',
		},
		Revenue: {
			'BGT Auction Fees To Protocol': 'Portion of auction bids retained by the Yeet protocol treasury.',
			'Token Buy Back': 'Portion of auction bids used for YEET buyback and burn via the Yeetarded Buyback Vault.',
		},
		ProtocolRevenue: {
			'BGT Auction Fees To Protocol': 'Portion of auction bids retained by the Yeet protocol treasury.',
		},
		HoldersRevenue: {
			'Token Buy Back': 'Portion of auction bids used for YEET buyback and burn via the Yeetarded Buyback Vault.',
		},
		SupplySideRevenue: {
			'BGT Bribes': 'Portion of auction bids paid out as BGT bribes via the reward vault to auction participants.',
			'Prize Pool': 'Portion of auction bids added to the prize pool, paid out to the winning slot leader.',
		},
	}
};

export default adapter;
