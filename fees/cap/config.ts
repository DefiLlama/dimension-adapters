import { CHAIN } from "../../helpers/chains";

export const capConfig = {
	[CHAIN.ETHEREUM]: {
		fromBlock: 22867447,
		fromTime: 1751892887,
		fromDate: "2025-07-07",
		infra: {
			oracle: {
				address: "0xcD7f45566bc0E7303fB92A93969BB4D3f6e662bb",
				fromBlock: 22867447,
			},
			lender: {
				address: "0x15622c3dbbc5614E6DFa9446603c1779647f01FC",
				fromBlock: 22867447,
			},
			delegation: {
				address: "0xF3E3Eae671000612CE3Fd15e1019154C1a4d693F",
				fromBlock: 22867447,
			},
		},
		tokens: {
			cUSD: {
				id: "cUSD",
				coingeckoId: "cap-usd",
				decimals: 18,
				address: "0xcCcc62962d17b8914c62D74FfB843d73B2a3cccC",
				fromBlock: 22874015,
			},
			stcUSD: {
				id: "stcUSD",
				coingeckoId: "cap-staked-usd",
				decimals: 18,
				address: "0x88887bE419578051FF9F4eb6C858A951921D8888",
				fromBlock: 22874056,
			},
		},
	},
} as const;

export const capABI = {
	Vault: {
		insuranceFund: "function insuranceFund() external view returns (address)",
		interestReceiver:
			"function interestReceiver() public view returns (address)",
		AddAssetEvent: "event AddAsset(address asset)",
	},
	Lender: {
		ReserveAssetAddedEvent:
			"event ReserveAssetAdded(address indexed asset, address vault, address debtToken, address interestReceiver, uint256 id)",
		ReserveInterestReceiverUpdatedEvent:
			"event ReserveInterestReceiverUpdated(address indexed asset, address interestReceiver)",
		RealizeInterestEvent:
			"event RealizeInterest(address indexed asset, uint256 realizedInterest, address interestReceiver)",
		RepayEvent:
			"event Repay(address indexed asset, address indexed agent, (uint256 repaid, uint256 vaultRepaid, uint256 restakerRepaid, uint256 interestRepaid) details)",
	},
	FeeReceiver: {
		FeesDistributedEvent: "event FeesDistributed(uint256 amount)",
		ProtocolFeeClaimed: "event ProtocolFeeClaimed(uint256 amount)",
	},
	Delegation: {
		DistributeReward:
			"event DistributeReward(address agent, address asset, uint256 amount)",
	},
} as const;

// should be ignored for revenue calculation
export const devAddresses = ["0xc1ab5a9593e6e1662a9a44f84df4f31fc8a76b52"];

export const vaultsSymbols = ["cUSD"];
