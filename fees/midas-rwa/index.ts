import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Sources:
// https://docs.midas.app/resources/smart-contracts-registry
// https://github.com/midas-apps/contracts/blob/main/contracts/interfaces/IDepositVault.sol
// https://github.com/midas-apps/contracts/blob/main/contracts/interfaces/IRedemptionVault.sol
const ABI = {
	oracle: "function lastAnswer() external view returns (int256)",
	totalSupply: "function totalSupply() external view returns (uint256)",
	decimals: "function decimals() external view returns (uint8)",
	// Instant events
	redeemInstant: "event RedeemInstant(address indexed user, address indexed tokenOut, uint256 amount, uint256 feeAmount, uint256 amountTokenOut)",
	redeemInstantCustom: "event RedeemInstantWithCustomRecipient(address indexed user, address indexed tokenOut, address recipient, uint256 amount, uint256 feeAmount, uint256 amountTokenOut)",
	depositInstant: "event DepositInstant(address indexed user, address indexed tokenIn, uint256 amountUsd, uint256 amountToken, uint256 fee, uint256 minted, bytes32 referrerId)",
	depositInstantCustom: "event DepositInstantWithCustomRecipient(address indexed user, address indexed tokenIn, address recipient, uint256 amountUsd, uint256 amountToken, uint256 fee, uint256 minted, bytes32 referrerId)",
	// Request-based events
	redeemRequest: "event RedeemRequest(uint256 indexed requestId, address indexed user, address indexed tokenOut, uint256 amountMTokenIn, uint256 feeAmount)",
	redeemRequestCustom: "event RedeemRequestWithCustomRecipient(uint256 indexed requestId, address indexed user, address indexed tokenOut, address recipient, uint256 amountMTokenIn, uint256 feeAmount)",
	depositRequest: "event DepositRequest(uint256 indexed requestId, address indexed user, address indexed tokenIn, uint256 amountToken, uint256 amountUsd, uint256 fee, uint256 tokenOutRate, bytes32 referrerId)",
	depositRequestCustom: "event DepositRequestWithCustomRecipient(uint256 indexed requestId, address indexed user, address indexed tokenIn, address recipient, uint256 amountToken, uint256 amountUsd, uint256 fee, uint256 tokenOutRate, bytes32 referrerId)",
};

const denominationCGId: Record<string, string> = {
	BTC: "bitcoin",
	ETH: "ethereum",
};

interface TokenConfig {
	address: string;
	oracle: string;
	denomination?: string;
	vaults?: string[];
}

const config: Record<string, Record<string, TokenConfig>> = {
	[CHAIN.ETHEREUM]: {
		mTBILL: {
			address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
			oracle: "0x056339C044055819E8Db84E71f5f2E1F536b2E5b",
			vaults: [
				"0x99361435420711723aF805F08187c9E6bF796683",
				"0xF6e51d24F4793Ac5e71e0502213a9BBE3A6d4517",
				"0x569D7dccBF6923350521ecBC28A555A500c4f0Ec",
			],
		},
		mBASIS: {
			address: "0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
			oracle: "0xE4f2AE539442e1D3Fb40F03ceEbF4A372a390d24",
			vaults: [
				"0xa8a5c4FF4c86a459EBbDC39c5BE77833B3A15d88",
				"0x19AB19e61A930bc5C7B75Bf06cDd954218Ca9F0b",
				"0x0D89C1C4799353F3805A3E6C4e1Cbbb83217D123",
			],
		},
		mBTC: {
			address: "0x007115416AB6c266329a03B09a8aa39aC2eF7d9d",
			oracle: "0xA537EF0343e83761ED42B8E017a1e495c9a189Ee",
			vaults: [
				"0x10cC8dbcA90Db7606013d8CD2E77eb024dF693bD",
				"0x30d9D1e76869516AEa980390494AaEd45C3EfC1a",
			],
		},
		mEDGE: {
			address: "0xbB51E2a15A9158EBE2b0Ceb8678511e063AB7a55",
			oracle: "0x698dA5D987a71b68EbF30C1555cfd38F190406b7",
			vaults: [
				"0xfE8de16F2663c61187C1e15Fb04D773E6ac668CC",
				"0x9B2C5E30E3B1F6369FC746A1C1E47277396aF15D",
			],
		},
		mMEV: {
			address: "0x030b69280892c888670EDCDCD8B69Fd8026A0BF3",
			oracle: "0x5f09Aff8B9b1f488B7d1bbaD4D89648579e55d61",
			vaults: [
				"0xE092737D412E0B290380F9c8548cB5A58174704f",
				"0xac14a14f578C143625Fc8F54218911e8F634184D",
			],
		},
		mAPOLLO: {
			address: "0x7CF9DEC92ca9FD46f8d86e7798B72624Bc116C05",
			oracle: "0x84303e5568C7B167fa4fEBc6253CDdfe12b7Ee4B",
			vaults: [
				"0xc21511EDd1E6eCdc36e8aD4c82117033e50D5921",
				"0x5aeA6D35ED7B3B7aE78694B7da2Ee880756Af5C0",
			],
		},
		msyrupUSD: {
			address: "0x20226607b4fa64228ABf3072Ce561d6257683464",
			oracle: "0x41c60765fA36109b19B21719F4593F19dDeFa663",
			vaults: [
				"0x5AE23D23B7986a708CBA9bF808aD9A43BF77d1b7",
				"0x9f7dd5462C183B6577858e16a13A4d864CE2f972",
			],
		},
		msyrupUSDp: {
			address: "0x2fE058CcF29f123f9dd2aEC0418AA66a877d8E50",
			oracle: "0x337d914ff6622510FC2C63ac59c1D07983895241",
			vaults: [
				"0x8493f1f2B834c2837C87075b0EdAc17f5273789a",
				"0x71EFa7AF1686C5c04AA34a120a91cb4262679C44",
			],
		},
		mRe7YIELD: {
			address: "0x87C9053C819bB28e0D73d33059E1b3DA80AFb0cf",
			oracle: "0x0a2a51f2f206447dE3E3a80FCf92240244722395",
			vaults: [
				"0xcE0A2953a5d46400Af601a9857235312d1924aC7",
				"0x5356B8E06589DE894D86B24F4079c629E8565234",
			],
		},
		mRe7BTC: {
			address: "0x9FB442d6B612a6dcD2acC67bb53771eF1D9F661A",
			oracle: "0x9de073685AEb382B7c6Dd0FB93fa0AEF80eB8967",
			vaults: [
				"0x5E154946561AEA4E750AAc6DeaD23D37e00E47f6",
				"0x4Fd4DD7171D14e5bD93025ec35374d2b9b4321b0",
			],
		},
		mFARM: {
			address: "0xA19f6e0dF08a7917F2F8A33Db66D0AF31fF5ECA6",
			oracle: "0x65df7299A9010E399A38d6B7159d25239cDF039b",
			vaults: [
				"0x695fb34B07a8cEc2411B1bb519fD8F1731850c81",
				"0xf4F042D90f0C0d3ABA4A30Caa6Ac124B14A7e600",
			],
		},
		mHYPER: {
			address: "0x9b5528528656DBC094765E2abB79F293c21191B9",
			oracle: "0x43881B05C3BE68B2d33eb70aDdF9F666C5005f68",
			vaults: [
				"0xbA9FD2850965053Ffab368Df8AA7eD2486f11024",
				"0x6Be2f55816efd0d91f52720f096006d63c366e98",
			],
		},
		mFONE: {
			address: "0x238a700eD6165261Cf8b2e544ba797BC11e466Ba",
			oracle: "0x8D51DBC85cEef637c97D02bdaAbb5E274850e68C",
			vaults: [
				"0x41438435c20B1C2f1fcA702d387889F346A0C3DE",
				"0x44b0440e35c596e858cEA433D0d82F5a985fD19C",
			],
		},
		mEVUSD: {
			address: "0x548857309BEfb6Fb6F20a9C5A56c9023D892785B",
			oracle: "0x6f51d8aF5bE2cF3517B8d6Cd07361bE382E83be6",
			vaults: [
				"0x5455222CCDd32F85C1998f57DC6CF613B4498C2a",
				"0x9C3743582e8b2d7cCb5e08caF3c9C33780ac446f",
			],
		},
		mHyperETH: {
			address: "0x5a42864b14C0C8241EF5ab62Dae975b163a2E0C1",
			oracle: "0x5C81ee2C3Ee8AaAC2eEF68Ecb512472D9E08A0fd",
			denomination: "ETH",
			vaults: [
				"0x57B3Be350C777892611CEdC93BCf8c099A9Ecdab",
				"0x15f724b35A75F0c28F352b952eA9D1b24e348c57",
			],
		},
		mHyperBTC: {
			address: "0xC8495EAFf71D3A563b906295fCF2f685b1783085",
			oracle: "0x3359921992C33ef23169193a6C91F2944A82517C",
			denomination: "BTC",
			vaults: [
				"0xeD22A9861C6eDd4f1292aeAb1E44661D5f3FE65e",
				"0x16d4f955B0aA1b1570Fe3e9bB2f8c19C407cdb67",
			],
		},
		mevBTC: {
			address: "0xb64C014307622eB15046C66fF71D04258F5963DC",
			oracle: "0xffd462e0602Dd9FF3F038fd4e77a533f8c474b65",
			vaults: [
				"0xA6d60A71844bc134f4303F5E40169D817b491E37",
				"0x2d7d5b1706653796602617350571B3F8999B950c",
			],
		},
		mM1USD: {
			address: "0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203",
			oracle: "0xad316aA927c0970C2e8f0B903211D0bd19A10702",
			vaults: [
				"0x0f7e323103b29E1B18d521DE957Ed0c4c0A8189E",
				"0x70Ba3211f2584Bf1C8a2aCdF0a00dba559CE1Ffa",
			],
		},
		mROX: {
			address: "0x67E1F506B148d0Fc95a4E3fFb49068ceB6855c05",
			oracle: "0x7fF56C3a31476c231e74E4F64e9d9718572B54Aa",
			vaults: [
				"0x511d88E64d843Ee11Bf039a3EB837393001aEDE7",
				"0xc33dAdA688f224c514682Ec6Ba940888d43C4b29",
			],
		},
		mGLOBAL: {
			address: "0x7433806912Eae67919e66aea853d46Fa0aef98A8",
			oracle: "0x66Aa9fcD63DF74e1f67A9452E6E59Fbc67f75E38",
			vaults: [
				"0xCe29c36c6D4556f2d01d79414C1354B968dDDEf1",
				"0x1e0fd66753198c7b8bA64edEe8d41D8628Bf20D7",
				"0xA0Fc8BDFb1E6a705C1375810989B1d70a982b01B",
			],
		},
	},
	[CHAIN.BASE]: {
		mTBILL: {
			address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
			oracle: "0x70E58b7A1c884fFFE7dbce5249337603a28b8422",
			vaults: [
				"0x8978e327FE7C72Fa4eaF4649C23147E279ae1470",
				"0x2a8c22E3b10036f3AEF5875d04f8441d4188b656",
			],
		},
		mBASIS: {
			address: "0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2",
			oracle: "0x6d62D3C3C8f9912890788b50299bF4D2C64823b6",
			vaults: [
				"0x80b666D60293217661E7382737bb3E42348f7CE5",
				"0xF804a646C034749b5484bF7dfE875F6A4F969840",
			],
		},
		mEVUSD: {
			address: "0xccbad2823328BCcAEa6476Df3Aa529316aB7474A",
			oracle: "0x4Fe7f62B2F4eF077aEd8f458c8B4652f5dE8080f",
			vaults: [
				"0x5f09Aff8B9b1f488B7d1bbaD4D89648579e55d61",
				"0x9BF00b7CFC00D6A7a2e2C994DB8c8dCa467ee359",
			],
		},
	},
	[CHAIN.OPTIMISM]: {
		mRe7ETH: {
			address: "0xE7Ba07519dFA06e60059563F484d6090dedF21B3",
			oracle: "0xcFfe26979e96B9E0454cC83aa03FC973C9Eb0E5E",
			denomination: "ETH",
			vaults: [
				"0xC562F73ADD198ce47E9Af5B0752dE3D7c991225D",
				"0x2c8AEe33a6B1eBDd047903B5FDe01D71B8854e6D",
			],
		},
	},
	[CHAIN.PLUME]: {
		mTBILL: {
			address: "0xE85f2B707Ec5Ae8e07238F99562264f304E30109",
			oracle: "0xb701ABEA3E4b6EAdAc4F56696904c5F551d2617b",
			vaults: [
				"0xb05F6aa8C2ea9aB8537cF09A9B765a21De249224",
				"0x3aC6b2Bf09f470e5674C3DA60Be7D2DA2791F897",
			],
		},
		mBASIS: {
			address: "0x0c78Ca789e826fE339dE61934896F5D170b66d78",
			oracle: "0x01D169AAB1aB4239D5cE491860a65Ba832F72ef2",
			vaults: [
				"0x8F38A24d064B41c990a3f47439a7a7EE713BF8Dc",
				"0x9B0d0bDAE237116F711E8C9d900B5dDCC8eF8B5D",
			],
		},
		mEDGE: {
			address: "0x69020311836D29BA7d38C1D3578736fD3dED03ED",
			oracle: "0x7D5622Aa8Cc259Ae39fBA51f3C1849797FB7e82D",
			vaults: [
				"0x23dE49C9ECb8bAaF4aBDeD123FaFbb7D5b7a0eE2",
				"0xC874394Cd67F7de462eb5c25889beC9744Bc0F80",
			],
		},
		mMEV: {
			address: "0x7d611dC23267F508DE90724731Dc88CA28Ef7473",
			oracle: "0x4e5B43C9c8B7299fd5C7410b18e3c0B718852061",
			vaults: [
				"0xe6F0C60Fca2bd97d633a3D9D49DBEFDF19636D8c",
				"0x331Af8984d9f10C5173E69537F41313996e7C3Cc",
			],
		},
	},
	[CHAIN.ETHERLINK]: {
		mTBILL: {
			address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
			oracle: "0x80dA45b66c4CBaB140aE53c9accB01BE4F41B7Dd",
			vaults: [
				"0xd65BFeB71271A4408ff335E59eCf6c5b21A33a70",
				"0x7f938d26b6179A96870afaECfB0578110E53A3b2",
			],
		},
		mBASIS: {
			address: "0x2247B5A46BB79421a314aB0f0b67fFd11dd37Ee4",
			oracle: "0x31D211312D9cF5A67436517C324504ebd5BD50a0",
			vaults: [
				"0x75C32818ce59D913f9E2aeDEcd5697566Ff9aE4A",
				"0x02e58De067a0c63B3656D7e1DF9ECBCbc9E5ffC6",
			],
		},
		mMEV: {
			address: "0x5542F82389b76C23f5848268893234d8A63fd5c8",
			oracle: "0x077670B2138Cc23f9a9d0c735c3ae1D4747Bb516",
			vaults: [
				"0x577617613C4FaC5A7561F8f3F2Cb128A560774Bc",
				"0x403a92A980903707FD8A3A1101f48Eb3ebd58166",
			],
		},
		mRe7YIELD: {
			address: "0x733d504435a49FC8C4e9759e756C2846c92f0160",
			oracle: "0x1989329b72C1C81E5460481671298A5a046f3B8E",
			vaults: [
				"0xBEf85e71EcD0517D0C1446751667891b04860753",
				"0xb24056AE566e24E35De798880E2dC28e2130De90",
			],
		},
	},
	[CHAIN.ROOTSTOCK]: {
		mTBILL: {
			address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
			oracle: "0x0Ca36aF4915a73DAF06912dd256B8a4737131AE7",
			vaults: [
				"0xf454A52DA2157686Ef99702C0C19c0E8D66bC03c",
				"0x99D22115Fd6706B78703fF015DE897d43667D12F",
			],
		},
		mBTC: {
			address: "0xEF85254Aa4a8490bcC9C02Ae38513Cae8303FB53",
			oracle: "0xa167BFbeEB48815EfB3E3393d91EC586c2421821",
			vaults: [
				"0x79A15707E2766d486681569Bd1041821f5e32998",
				"0xe7a1A676D0CCA2e20A69adD500985C7271a40205",
			],
		},
		mHyperBTC: {
			address: "0x7F71f02aE0945364F658860d67dbc10c86Ca3a3C",
			oracle: "0xf940A175794fe571fD6e45d8C4f57c642C978827",
			denomination: "BTC",
			vaults: [
				"0x82Dd60B6e3f1f3Db025a715952B0e9f96B7D7a53",
				"0x4F4da20f45Ce2c94e84B93e4D73f3F3F33b8B570",
			],
		},
	},
	[CHAIN.SAPPHIRE]: {
		mTBILL: {
			address: "0xDD629E5241CbC5919847783e6C96B2De4754e438",
			oracle: "0xF76d11D4473EA49a420460B72798fc3B38D4d0CF",
			vaults: [
				"0xD7Fe0e91C05CAfdd26dA4B176eEc2b883795BDcC",
				"0xf939E88ecAd43115116c7106DfdbdC4b1315a7Ee",
			],
		},
	},
	[CHAIN.OG]: {
		mEDGE: {
			address: "0xA1027783fC183A150126b094037A5Eb2F5dB30BA",
			oracle: "0xC0a696cB0B56f6Eb20Ba7629B54356B0DF245447",
			vaults: [
				"0x72a93168AE79F269DeB2b1892F2AFd7eaa800271",
				"0x9dae503014edc48A4d8FE789f22c70Ae650eb79B",
			],
		},
	},
	[CHAIN.MONAD]: {
		mEDGE: {
			address: "0x1c8eE940B654bFCeD403f2A44C1603d5be0F50Fa",
			oracle: "0x33F3cd52C55416ca2eAc184b62FA7481af88271d",
			vaults: [
				"0xdF7dEb47635AF76Da5e455C6b0F4E26222326FD9",
				"0x2Ce347dECFc8dAB433c4EB6CA171747E5a82c332",
			],
		},
		mHYPER: {
			address: "0xd90F6bFEd23fFDE40106FC4498DD2e9EDB95E4e7",
			oracle: "0xf3BBD544F8453eE82211709422d8d7906f816584",
		},
		mHyperBTC: {
			address: "0xF7Cf282eC810fDed974F99c0163E792f432892BC",
			oracle: "0x165d2E3C0A368988F497F649B6fe2134bE20FD8c",
			denomination: "BTC",
		},
	},
	[CHAIN.PLASMA]: {
		mHYPER: {
			address: "0xb31BeA5c2a43f942a3800558B1aa25978da75F8a",
			oracle: "0xfC3E47c4Da8F3a01ac76c3C5ecfBfC302e1A08F0",
			vaults: [
				"0xa603cf264aDEB8E7f0f063C116929ADAC2D4286E",
				"0x880661F9b412065D616890cA458dcCd0146cb77C",
			],
		},
	},
	[CHAIN.KATANA]: {
		mRe7SOL: {
			address: "0xC6135d59F8D10c9C035963ce9037B3635170D716",
			oracle: "0x3E4b4b3Aed4c51a6652cdB96732AC98c37b9837B",
			vaults: [
				"0x175A9b122bf22ac2b193a0A775D7370D5A75268E",
				"0xE93E6Cf151588d63bB669138277D20f28C2E7cdA",
			],
		},
		mHYPER: {
			address: "0x926a8a63Fa1e1FDBBEb811a0319933B1A0F1EDbb",
			oracle: "0x2cd29cEB7354651Dc5417c5b4D201a1B7DBE4a8C",
		},
	},
	[CHAIN.TAC]: {
		mRe7YIELD: {
			address: "0x0a72ED3C34352Ab2dd912b30f2252638C873D6f0",
			oracle: "0xBbA185027F6c62dac2d7f95CD582785e22d61738",
			vaults: [
				"0xbD2CE9D5F2c682FCA3ce587Bf1C041ad8DDd2a69",
				"0x911f9aF9138284A49b29F9894571Fb86e29D1d79",
			],
		},
	},
	[CHAIN.XRPL_EVM]: {
		mXRP: {
			address: "0x06e0B0F1A644Bb9881f675Ef266CeC15a63a3d47",
			oracle: "0xFF64785Ee22D764F8E79812102d3Fa7f2d3437Af",
			vaults: [
				"0x30FBc82A72CA674AA250cd6c27BCca1Fe602f1Bb",
				"0xDaC1b058cE42b67Ba33DbfDBA972d76C83C085D6",
			],
		},
	},
	[CHAIN.BSC]: {
		mXRP: {
			address: "0xc8739fbBd54C587a2ad43b50CbcC30ae34FE9e34",
			oracle: "0x3BdE0b7B59769Ec00c44C77090D88feB4516E731",
			vaults: [
				"0x30B59844eC16ABA3ec4ca0BD97557CcB670D924E",
				"0x73685BD72dF34B92Bc81D43ef35CFf4300DE8625",
			],
		},
	},
};

const fetch = async (options: FetchOptions) => {
	const { chain, createBalances, fromApi, toApi, api, getLogs } = options;
	const dailyFees = createBalances();
	const dailyRevenue = createBalances();
	const dailySupplySideRevenue = createBalances();
	const tokens = config[chain];

	const tokenList = Object.values(tokens);
	const addresses = tokenList.map((t) => t.address);
	const oracles = tokenList.map((t) => t.oracle);
	const allVaults = tokenList.flatMap((t) => t.vaults ?? []);

	// NAV yield (supply-side revenue)
	const [supplies, pricesBefore, pricesAfter, tokenDecimals, oracleDecimals] = await Promise.all([
		api.multiCall({ abi: ABI.totalSupply, calls: addresses, permitFailure: true }),
		fromApi.multiCall({ abi: ABI.oracle, calls: oracles, permitFailure: true }),
		toApi.multiCall({ abi: ABI.oracle, calls: oracles, permitFailure: true }),
		api.multiCall({ abi: ABI.decimals, calls: addresses, permitFailure: true }),
		api.multiCall({ abi: ABI.decimals, calls: oracles, permitFailure: true }),
	]);

	tokenList.forEach((token, i) => {
		const supply = supplies[i];
		const priceBefore = pricesBefore[i];
		const priceAfter = pricesAfter[i];
		const tDecimals = tokenDecimals[i];
		const oDecimals = oracleDecimals[i];
		if (!supply || !priceBefore || !priceAfter || tDecimals == null || oDecimals == null) return;

		const priceChange = Number(priceAfter) - Number(priceBefore);

		const dailyYield = (Number(supply) / 10 ** tDecimals) * (priceChange / 10 ** oDecimals);
		if (token.denomination) {
			dailyFees.addCGToken(denominationCGId[token.denomination], dailyYield, METRIC.ASSETS_YIELDS);
			dailySupplySideRevenue.addCGToken(denominationCGId[token.denomination], dailyYield, METRIC.ASSETS_YIELDS);
		} else {
			dailyFees.addUSDValue(dailyYield, METRIC.ASSETS_YIELDS);
			dailySupplySideRevenue.addUSDValue(dailyYield, METRIC.ASSETS_YIELDS);
		}
	});

	// Instant & request-based redemption/deposit fees (protocol revenue)
	if (allVaults.length > 0) {
		const logOpts = { targets: allVaults, flatten: true };
		const [redeemLogs, redeemCustomLogs, depositLogs, depositCustomLogs, redeemRequestLogs, redeemRequestCustomLogs, depositRequestLogs, depositRequestCustomLogs] = await Promise.all([
			getLogs({ ...logOpts, eventAbi: ABI.redeemInstant }),
			getLogs({ ...logOpts, eventAbi: ABI.redeemInstantCustom }),
			getLogs({ ...logOpts, eventAbi: ABI.depositInstant }),
			getLogs({ ...logOpts, eventAbi: ABI.depositInstantCustom }),
			getLogs({ ...logOpts, eventAbi: ABI.redeemRequest }),
			getLogs({ ...logOpts, eventAbi: ABI.redeemRequestCustom }),
			getLogs({ ...logOpts, eventAbi: ABI.depositRequest }),
			getLogs({ ...logOpts, eventAbi: ABI.depositRequestCustom }),
		]);

		// Build vault -> token lookup for converting fees
		const vaultToToken: Record<string, { oracle: string; address: string; denomination?: string }> = {};
		tokenList.forEach((token) => {
			(token.vaults ?? []).forEach((vault) => {
				vaultToToken[vault.toLowerCase()] = { oracle: token.oracle, address: token.address, denomination: token.denomination };
			});
		});

		// Get oracle prices and decimals for fee conversion
		const uniqueOracles = [...new Set(Object.values(vaultToToken).map((v) => v.oracle))];
		const uniqueMTokens = [...new Set(Object.values(vaultToToken).map((v) => v.address))];
		const [oraclePrices, feeOracleDecimals, feeMTokenDecimals] = await Promise.all([
			api.multiCall({ abi: ABI.oracle, calls: uniqueOracles, permitFailure: true }),
			api.multiCall({ abi: ABI.decimals, calls: uniqueOracles, permitFailure: true }),
			api.multiCall({ abi: ABI.decimals, calls: uniqueMTokens, permitFailure: true }),
		]);

		const oraclePriceMap: Record<string, number> = {};
		uniqueOracles.forEach((oracle, i) => {
			if (oraclePrices[i] == null || feeOracleDecimals[i] == null) return;
			oraclePriceMap[oracle] = Number(oraclePrices[i]) / 10 ** Number(feeOracleDecimals[i]);
		});
		const mTokenDecMap: Record<string, number> = {};
		uniqueMTokens.forEach((mToken, i) => {
			if (feeMTokenDecimals[i] != null) mTokenDecMap[mToken] = Number(feeMTokenDecimals[i]);
		});

		// Process redeem fees (feeAmount) — instant + request-based
		for (const log of [...redeemLogs, ...redeemCustomLogs, ...redeemRequestLogs, ...redeemRequestCustomLogs]) {
			const feeAmount = Number(log.feeAmount);
			if (feeAmount <= 0) continue;
			const info = vaultToToken[log.address?.toLowerCase()];
			if (!info) continue;
			const price = oraclePriceMap[info.oracle];
			const dec = mTokenDecMap[info.address];
			if (!price || dec == null) continue;

			const feeUsd = (feeAmount / 10 ** dec) * price;
			dailyFees.addUSDValue(feeUsd, METRIC.MINT_REDEEM_FEES);
			dailyRevenue.addUSDValue(feeUsd, METRIC.MINT_REDEEM_FEES);
		}

		// Process deposit fees — instant + request-based
		for (const log of [...depositLogs, ...depositCustomLogs, ...depositRequestLogs, ...depositRequestCustomLogs]) {
			const fee = Number(log.fee);
			if (fee <= 0) continue;
			dailyFees.add(log.tokenIn, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
			dailyRevenue.add(log.tokenIn, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
		}
	}

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
		dailySupplySideRevenue,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	adapter: {
		[CHAIN.ETHEREUM]: { fetch, start: "2023-12-02" },
		[CHAIN.BASE]: { fetch, start: "2025-01-15" },
		[CHAIN.OPTIMISM]: { fetch, start: "2025-04-01" },
		[CHAIN.PLUME]: { fetch, start: "2025-05-01" },
		[CHAIN.ETHERLINK]: { fetch, start: "2025-02-14" },
		[CHAIN.MONAD]: { fetch, start: "2025-12-13" },
		[CHAIN.PLASMA]: { fetch, start: "2025-10-07" },
		[CHAIN.KATANA]: { fetch, start: "2026-01-27" },
		[CHAIN.XRPL_EVM]: { fetch, start: "2026-03-15" },
		// [CHAIN.SAPPHIRE]: { fetch, start: "2026-01-01" },
		// [CHAIN.BSC]: { fetch, start: "2026-02-07" },
		// [CHAIN.TAC]: { fetch, start: "2026-01-09" },
		// [CHAIN.ROOTSTOCK]: { fetch, start: "2025-03-01" },
		// [CHAIN.OG]: { fetch, start: "2025-09-16" },
	},
	allowNegativeValue: true,
	methodology: {
		Fees: "Net yield accrued to mToken holders (NAV appreciation) plus redemption and deposit fees (instant + request-based) charged by the protocol.",
		Revenue: "Redemption and deposit fees collected by Midas from both instant and request-based operations. Management and performance fees are deducted before NAV publication.",
		ProtocolRevenue: "Same as Revenue — redemption and deposit fees from instant and request-based operations.",
		SupplySideRevenue: "Yield earned by mToken holders, equal to the daily NAV appreciation of each mToken.",
	},
	breakdownMethodology: {
		Fees: {
			[METRIC.ASSETS_YIELDS]: "NAV growth of mTokens over the period, representing net yield after management and performance fees.",
			[METRIC.MINT_REDEEM_FEES]: "Redemption fees from instant and request-based operations on vault contracts.",
			[METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees from instant and request-based operations on vault contracts.",
		},
		Revenue: {
			[METRIC.MINT_REDEEM_FEES]: "Redemption fees collected by the protocol (instant + request-based).",
			[METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees collected by the protocol (instant + request-based).",
		},
		ProtocolRevenue: {
			[METRIC.MINT_REDEEM_FEES]: "Redemption fees collected by the protocol (instant + request-based).",
			[METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees collected by the protocol (instant + request-based).",
		},
		SupplySideRevenue: {
			[METRIC.ASSETS_YIELDS]: "NAV growth of mTokens over the period, representing yield earned by token holders.",
		},
	},
};

export default adapter;
