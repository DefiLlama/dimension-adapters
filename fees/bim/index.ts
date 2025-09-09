import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";

const tokens: Record<string, string[]> = {
	[CHAIN.ETHEREUM]: [
		"0xdac17f958d2ee523a2206206994597c13d831ec7",
		"0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
		"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		"0x6b175474e89094c44da98b954eedeac495271d0f",
		"0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f",
		"0x3845badAde8e6dFF049820680d1F14bD3903a5d0",
		"0x0f5d2fb29fb7d3cfee444a200298f468908cc942",
		"0xD533a949740bb3306d119CC777fa900bA034cd52",
		"0xdb25f211ab05b1c97d595516f45794528a807ad8",
		"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
		"0x514910771af9ca656af840dff83e8264ecf986ca",
		"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
		"0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
		"0x5a98fcbea516cf06857215779fd812ca3bef1b32",
		"0x111111111117dc0aa78b770fa6a738034120c302",
		"0x1a7e4e63778b4f12a199c062f3efdd288afcbce8",
		"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
		"0x418D75f65a02b3D53B2418FB8E1fe493759c7605",
		"0x0000206329b97db379d5e1bf586bbdb969c63274",
		"0x31429d1856ad1377a8a0079410b297e1a9e214c2",
		"0xbb0e17ef65f82ab018d8edd776e8dd940327b28b",
		"0xB1F1ee126e9c96231Cc3d3fAD7C08b4cf873b1f1",
		"0x45804880de22913dafe09f4980848ece6ecbaf78",
		"0x68749665FF8D2d112Fa859AA293F07A622782F38",
		"0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
		"0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
		"0x8f8221afbb33998d8584a2b05749ba73c37a938a",
		"0x5f98805A4E8be255a32880FDeC7F6728C6568bA0",
		"0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
		"0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
		"0xf10c41ca085fc8d9326a65408d14dae28a3e69a5",
		"0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
		"0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
		"0x18084fba666a33d37592fa2633fd49a74dd93a88",
		"0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
		"0xc00e94cb662c3520282e6f5717214004a7f26888",
		"0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
		"0xd2ba23de8a19316a638dc1e7a9adda1d74233368",
		"0xc944e90c64b2c07662a292be6244bdf05cda44a7",
		"0xdeFA4e8a7bcBA345F687a2f1456F5Edd9CE97202",
		"0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
		"0x83f20f44975d03b1b09e64809b757c47f942beea",
		"0x6810e776880c02933d47db1b9fc05908e5386b96",
		"0xba100000625a3754423978a60c9317c58a424e3D",
		"0x853d955acef822db058eb8505911ed77f175b99e",
		"0x5afe3855358e112b5647b952709e6165e1c1eeee",
		"0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB",
		"0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3",
		"0x57e114B691Db790C35207b2e685D4A43181e6061",
		"0x163f8c2467924be0ae7b5347228cabf260318753",
		"0x808507121b80c02388fad14726482e061b8da827",
		"0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91",
		"0x6985884C4392D348587B19cb9eAAf157F13271cd",
		"0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
		"0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f",
		"0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
		"0x004626a008b1acdc4c74ab51644093b155e59a23",
		"0xb01dd87b29d187f3e3a4bf6cdaebfb97f3d9ab98",
		"0x58D97B57BB95320F9a05dC918Aef65434969c2B2",
		"0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409",
		"0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898",
		"0xeF4461891DfB3AC8572cCf7C794664A8DD927945",
		"0x56072C95FAA701256059aa122697B133aDEd9279",
		"0xba3f535bbcccca2a154b573ca6c5a49baae0a3ea",
	],
	[CHAIN.OPTIMISM]: [
		"0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
		"0x68f180fcce6836688e9084f035309e29bf0a2095",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
		"0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
		"0x8700daec35af8ff88c16bdf0418774cb3d7599b4",
		"0x76FB31fb4af56892A25e32cFC43De717950c9278",
		"0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6",
		"0x6fd9d7AD17242c41f7131d257212c54A0e816691",
		"0x4200000000000000000000000000000000000042",
		"0x9485aca5bbBE1667AD97c7fE7C4531a624C8b1ED",
		"0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
		"0x4200000000000000000000000000000000000006",
		"0x0000206329b97db379d5e1bf586bbdb969c63274",
		"0x8c6f28f2f1a3c87f0f938b96d27520d9751ec8d9",
		"0x1f32b1c2345538c0c6f582fcb022739c4a194ebb",
		"0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40",
		"0xC52D7F23a2e460248Db6eE192Cb23dD12bDDCbf6",
		"0x9560e827af36c94d2ac33a39bce1fe78631088db",
		"0xa00E3A3511aAC35cA78530c85007AFCd31753819",
		"0x3eaEb77b03dBc0F6321AE1b72b2E9aDb0F60112B",
		"0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921",
		"0x2E3D870790dC77A83DD1d18184Acc7439A53f475",
		"0xdc6ff44d5d932cbd77b52e5612ba0529dc6226f1",
		"0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91",
		"0x6985884c4392d348587b19cb9eaaf157f13271cd",
		"0x087c440f251ff6cfe62b86dde1be558b95b4bb9b",
		"0xeF4461891DfB3AC8572cCf7C794664A8DD927945",
	],
	[CHAIN.BSC]: [
		"0x55d398326f99059ff775485246999027b3197955",
		"0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
		"0xcc42724c6683b7e57334c4e856f4c9965ed682bd",
		"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
		"0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
		"0x0eb3a705fc54725037cc9e008bdede697f62f335",
		"0x26433c8127d9b4e9B71Eaa15111DF99Ea2EeB2f8",
		"0xfb6115445bff7b52feb98650c87f44907e58f802",
		"0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0xbf5140a22578168fd562dccf235e5d43a02ce9b1",
		"0xcc6f1e1b87cfcbe9221808d2d85c501aab0b5192",
		"0x4b0f1812e5df2a09796481ff14017e6005508003",
		"0x111111111117dc0aa78b770fa6a738034120c302",
		"0x2170ed0880ac9a755fd29b2688956bd959f933f8",
		"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
		"0x715d400f88c167884bbcc41c5fea407ed4d2f8a0",
		"0x031b41e504677879370e9dbcf937283a8691fa7f",
		"0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe",
		"0x52ce071bd9b1c4b00a0b92d298c512478cad67e8",
		"0x5f0da599bb2cccfcf6fdfd7d81743b6020864350",
		"0xfe56d5892bdffc7bf58f2e84be1b2c32d21c308b",
		"0x947950BcC74888a40Ffa2593C5798F11Fc9124C4",
		"0x90C97F71E18723b0Cf0dfa30ee176Ab653E89F40",
		"0xb3Ed0A426155B79B898849803E3B36552f7ED507",
		"0x6985884c4392d348587b19cb9eaaf157f13271cd",
		"0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
		"0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409",
		"0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
	],
	[CHAIN.XDAI]: [
		"0x4ECaBa5870353805a9F068101A40E0f32ed605C6",
		"0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
		"0x44fA8E6f47987339850636F88629646662444217",
		"0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
		"0x0aa1e96d2a46ec6beb2923de1e61addf5f5f1dce",
		"0x6c76971f98945ae98dd7d4dfca8711ebea946ea6",
		"0xaBEf652195F98A91E490f047A5006B71c85f058d",
		"0xDf6FF92bfDC1e8bE45177DC1f4845d391D3ad8fD",
		"0xaf204776c7245bF4147c2612BF6e5972Ee483701",
		"0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
		"0x1e2c4fb7ede391d116e6b41cd0608260e8801d59",
		"0x7eF541E2a22058048904fE5744f9c7E4C57AF717",
		"0x177127622c4A00F3d409B75571e12cB3c8973d3c",
		"0xcB444e90D8198415266c6a2724b7900fb12FC56E",
		"0x004626a008b1acdc4c74ab51644093b155e59a23",
	],
	[CHAIN.POLYGON]: [
		"0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
		"0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
		"0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
		"0xac51C4c48Dc3116487eD4BC16542e27B5694Da1b",
		"0x50b728d8d964fd00c2d0aad81718b71311fef68a",
		"0xbbba073c31bf03b8acf7c28ef0738decf3695683",
		"0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4",
		"0x172370d5Cd63279eFa6d502DAB29171933a610AF",
		"0xa3c0def5462f124c393b203919b9fa0bdd8ee869",
		"0xe111178a87a3bff0c8d18decba5798827539ae99",
		"0xd6df932a45c0f255f85145f286ea0b292b21c90b",
		"0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39",
		"0xb33eaad8d922b1083446dc23f610c2567fb5180f",
		"0x7f67639ffc8c93dd558d452b8920b28815638c44",
		"0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7",
		"0xC3C7d422809852031b44ab29EEC9F1EfF2A58756",
		"0xe0b52e49357fd4daf2c15e02058dce6bc0057db4",
		"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
		"0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
		"0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
		"0xecdcb5b88f8e3c15f95c720c51c71c9e2080525d",
		"0x900F717EA076E1E7a484ad9DD2dB81CEEc60eBF1",
		"0x553d3D295e0f695B9228246232eDF400ed3560B5",
		"0xb25e20de2f2ebb4cffd4d16a55c7b395e8a94762",
		"0x03b54a6e9a984069379fae1a4fc4dbae93b3bccd",
		"0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b",
		"0xc4Ce1D6F5D98D65eE25Cf85e9F2E9DcFEe6Cb5d6",
		"0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c",
		"0xb5c064f955d8e7f38fe0460c556a72987494ee17",
		"0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c",
		"0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a",
		"0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3",
		"0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89",
		"0x6985884c4392d348587b19cb9eaaf157f13271cd",
		"0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6",
		"0xc2ff25dd99e467d2589b2c26edd270f220f14e47",
	],
	[CHAIN.BASE]: [
		"0x555FFF48549C1A25a723Bd8e7eD10870D82E8379",
		"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
		"0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB",
		"0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE",
		"0x4200000000000000000000000000000000000006",
		"0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
		"0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
		"0x940181a94a35a4569e4529a3cdfb74e38fd98631",
		"0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
		"0x236aa50979d5f3de3bd1eeb40e81137f22ab794b",
		"0x417Ac0e078398C154EdFadD9Ef675d30Be60Af93",
		"0x9e1028F5F1D5eDE59748FFceE5532509976840E0",
		"0x7D49a065D17d6d4a55dc13649901fdBB98B2AFBA",
		"0x7c6b91D9Be155A6Db01f749217d76fF02A7227F2",
		"0xc694a91e6b071bf030a18bd3053a7fe09b6dae69",
		"0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91",
		"0x6985884c4392d348587b19cb9eaaf157f13271cd",
		"0x6Bb7a212910682DCFdbd5BCBb3e28FB4E8da10Ee",
		"0x087c440f251ff6cfe62b86dde1be558b95b4bb9b",
		"0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842",
		"0xcbD06E5A2B0C65597161de254AA074E489dEb510",
		"0xcb585250f852c6c6bf90434ab21a00f02833a4af",
		"0xcbADA732173e39521CDBE8bf59a6Dc85A9fc7b8c",
		"0x3055913c90Fcc1A6CE9a358911721eEb942013A1",
		"0xcb17C9Db87B595717C857a08468793f5bAb6445F",
	],
	[CHAIN.ARBITRUM]: [
		"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
		"0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
		"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
		"0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
		"0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978",
		"0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
		"0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
		"0x912CE59144191C1204E64559FE8253a0e49E6548",
		"0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60",
		"0xFA5Ed56A203466CbBC2430a43c66b9D8723528E7",
		"0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
		"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
		"0x0000206329b97db379d5e1bf586bbdb969c63274",
		"0x5979D7b546E38E414F7E9822514be443A4800529",
		"0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40",
		"0x498Bf2B1e120FeD3ad3D42EA2165E9b73f99C1e5",
		"0x9623063377AD1B27544C965cCd7342f7EA7e88C7",
		"0xe4dddfe67e7164b0fe14e218d80dc4c08edc01cb",
		"0xd4d42f0b6def4ce0383636770ef773390d85c61a",
		"0x040d1edc9569d4bab2d15287dc5a4f10f56a56b8",
		"0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
		"0xcb8b5cd20bdcaea9a010ac1f8d835824f5c87a04",
		"0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8",
		"0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91",
		"0x6985884c4392d348587b19cb9eaaf157f13271cd",
		"0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33",
		"0x004626a008b1acdc4c74ab51644093b155e59a23",
		"0x087c440f251ff6cfe62b86dde1be558b95b4bb9b",
		"0x1b896893dfc86bb67Cf57767298b9073D2c1bA2c",
	],
};

const stakingTarget = "0xcc0516d2B5D8E156890D894Ee03a42BaC7176972";
const bridgeAndStakingTarget = "0x1895108f64033F4c0A1fEd0669Adc93e7E017f3C";
const vaultsEndpoint = "https://staking-api.bim.finance/vaults";

type ChainConfigType = {
	tokens: string[];
	target: string;
	name: string;
};

const chainConfig: Partial<Record<CHAIN, ChainConfigType>> = {
	[CHAIN.OPTIMISM]: {
		target: stakingTarget,
		tokens: [ADDRESSES.optimism.WETH],
		name: "optimism",
	},
	[CHAIN.XDAI]: {
		target: stakingTarget,
		tokens: [ADDRESSES.xdai.WXDAI],
		name: "gnosis",
	},
	[CHAIN.BASE]: {
		target: stakingTarget,
		tokens: [ADDRESSES.base.WETH],
		name: "base",
	},
	[CHAIN.POLYGON]: {
		target: stakingTarget,
		tokens: [ADDRESSES.polygon.WMATIC_2],
		name: "polygon",
	},
	[CHAIN.ARBITRUM]: {
		target: stakingTarget,
		tokens: [ADDRESSES.arbitrum.WETH],
		name: "arbitrum",
	},
	[CHAIN.BSC]: {
		target: stakingTarget,
		tokens: [ADDRESSES.bsc.WBNB],
		name: "bsc",
	},
	[CHAIN.ETHEREUM]: {
		target: stakingTarget,
		tokens: [ADDRESSES.ethereum.WETH],
		name: "ethereum",
	},
};

const baseAdapter: BaseAdapter = {
	[CHAIN.OPTIMISM]: {
		start: "2024-10-21",
	},
	[CHAIN.XDAI]: {
		start: "2024-10-21",
	},
	[CHAIN.BASE]: {
		start: "2024-10-21",
	},
	[CHAIN.POLYGON]: {
		start: "2024-10-21",
	},
	[CHAIN.ARBITRUM]: {
		start: "2024-10-21",
	},
	[CHAIN.BSC]: {
		start: "2024-10-21",
	},
	[CHAIN.ETHEREUM]: {
		start: "2024-10-21",
	},
};

const getStakingFromAddresses = async (chain: CHAIN): Promise<string[]> => {
	const config = chainConfig[chain];
	if (!config) {
		return [];
	}
	const chainVaults = await fetchURL(vaultsEndpoint);
	const fromAddresses = chainVaults
		.filter((vault: { chain: string }) => vault.chain === config.name)
		.map((vault: { strategy: string }) => vault.strategy);
	fromAddresses;
	return fromAddresses;
};

const getStakingFees = async (options: FetchOptions): Promise<any> => {
	const { chain } = options;
	const config = chainConfig[chain];
	if (!config) {
		return options.createBalances();
	}
	const { target, tokens } = config;
	const stakingFromAddresses = await getStakingFromAddresses(chain as CHAIN);
	return await addTokensReceived({
		options,
		tokens: tokens,
		target,
		fromAdddesses: stakingFromAddresses,
	});
};

const getBridgeAndSwapFees = async (options: FetchOptions): Promise<any> => {
	const { chain } = options;
	return await addTokensReceived({
		options,
		target: bridgeAndStakingTarget,
		tokens: tokens[chain],
	});
};

const fetch = async (options: FetchOptions) => {
	const stakingFeesPromise = getStakingFees(options);
	let dailyBridgeAndSwapFeesPromise = getBridgeAndSwapFees(options);
	const dailyFees = await stakingFeesPromise;
	dailyFees.addBalances(await dailyBridgeAndSwapFeesPromise);

	return {
		dailyFees: dailyFees || 0,
		dailyRevenue: dailyFees || 0,
		dailyProtocolRevenue: dailyFees || 0,
	};
};

const methodology = {
	Fees: `9% of each harvest is charged as a performance fee for staking and between 0.25% and 0.125% depending on how much BIM is held is charged for every swap or bridge.`,
	Revenue: `9% of each harvest is charged as a performance fee for staking and between 0.25% and 0.125% depending on how much BIM is held is charged for every swap or bridge.`,
	ProtocolRevenue: `9% of each harvest is charged as a performance fee for staking and between 0.25% and 0.125% depending on how much BIM is held is charged for every swap or bridge.`,
};

const adapter: SimpleAdapter = {
	version: 2,
	fetch,
	adapter: baseAdapter,
	methodology,
};

export default adapter;
