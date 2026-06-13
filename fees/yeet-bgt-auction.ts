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

	const recipients: string[] = await options.api.call({ target: TAX_SPLITTER, abi: abis.getRecipients });
	const recipientInfos = await options.api.multiCall({
		target: TAX_SPLITTER,
		abi: abis.getRecipientInfo,
		calls: recipients,
	});

	const bpsByRole: Record<string, bigint> = {};
	for (const info of recipientInfos) {
		const name = info.name.toLowerCase();
		bpsByRole[name] = BigInt(info.percentage);
	}

	const protocolBps = bpsByRole["treasury"] ?? 0n;
	const buybackBps = bpsByRole["redacted"] ?? 0n;

	const logs = await options.getLogs({
		target: TAX_SPLITTER,
		eventAbi: abis.FundsDistributed,
	});

	logs.forEach((log) => {
		const amount = log.totalAmount;
		const protocolAmount = amount * protocolBps / PERCENTAGE_SCALE;
		const buybackAmount = amount * buybackBps / PERCENTAGE_SCALE;
    dailyFees.add(ADDRESSES.berachain.WBERA, amount, 'BGT Auction Fees');
    dailyRevenue.add(ADDRESSES.berachain.WBERA, amount, 'BGT Auction Fees');
		dailyProtocolRevenue.add(ADDRESSES.berachain.WBERA, protocolAmount, 'BGT Auction Fees To Protocol');
		dailyHoldersRevenue.add(ADDRESSES.berachain.WBERA, buybackAmount, 'Token Buy Back');
	});

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
		dailyHoldersRevenue,
	};
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
	adapter: {
		[CHAIN.BERACHAIN]: {
			fetch,
			start: "2025-03-01",
		},
	},
  methodology: {
    Fees: "Protocol fees extracted from BGT Auction bids (treasury + YEET buybacks).",
  	Revenue: "Protocol treasury + YEET buyback portion of auction bids.",
  	ProtocolRevenue: "Portion of auction bids retained by the Yeet protocol treasury.",
  	HoldersRevenue: "Portion of auction bids used for YEET buyback and burn via the Yeetarded Buyback Vault.",
  },
  breakdownMethodology: {
    Fees: {
     'BGT Auction Fees': 'Protocol fees extracted from BGT Auction bids (treasury + YEET buybacks).', 
    },
    Revenue: {
     'BGT Auction Fees': 'Protocol treasury + YEET buyback portion of auction bids.', 
    },
    HoldersRevenue: {
     'Token Buy Back': 'Portion of auction bids used for YEET buyback and burn via the Yeetarded Buyback Vault.', 
    },
  }
};

export default adapter;
