import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";
import { univ2Adapter2 } from "../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../adapters/types";
import { createFactoryExports } from "./registry";

const velodromeSwapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const echodexSwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to, uint256 amountTokenFee, uint256 amountTokenReward)'

const configs: Record<string, Record<string, any>> = {
  "megaswap": {
    megaeth: { factory: '0x72B94fA9F854Da1bCCD03F3bAB54cF60C32193F3' },
  },
  "warpx-v2": {
    megaeth: { factory: '0xB3Ae00A68F09E8b8a003B7669e2E84544cC4a385' },
  },
  "flowswap-v2": {
    flow: { factory: '0x681D1bFE03522e0727730Ba02a05CD3C0a08fa30' },
  },
  "Scale": {
    base: { factory: '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04' },
  },
  "dfyn": {
    polygon: { factory: '0xE7Fb3e833eFE5F9c441105EB65Ef8b261266423B' },
  },
  "shibaswap": {
    ethereum: { factory: '0x115934131916c8b277dd010ee02de363c09d037c' },
    shibarium: { factory: '0xc2b4218F137e3A5A9B98ab3AE804108F0D312CBC', start: '5-15-24' },
  },
  "kittypunch": {
    flow: { factory: '0x29372c22459a4e373851798bFd6808e71EA34A71' },
  },
  "linehub-v2": {
    linea: { factory: '0x7811DeF28977060784cC509641f2DD23584b7671' },
  },
  "metavault-amm-v2": {
    scroll: { factory: '0xCc570Ec20eCB62cd9589FA33724514BDBc98DC7E' },
    linea: { factory: '0xCc570Ec20eCB62cd9589FA33724514BDBc98DC7E' },
  },
  "rockswap": {
    bitrock: { factory: '0x02c73ecb9B82e545E32665eDc42Ae903F8AA86a9' },
  },
  "sonicxswap": {
    sonic: { factory: '0x0569F2A6B281b139bC164851cf86E4a792ca6e81' },
  },
  "Viridian": {
    core: { factory: '0xb54a83cfEc6052E05BB2925097FAff0EC22893F3' },
  },
  "luaswap": {
    ethereum: { factory: '0x0388C1E0f210AbAe597B7DE712B9510C6C36C857' },
  },
  "bakeryswap": {
    bsc: { factory: '0x01bF7C66c6BD861915CdaaE475042d3c4BaE16A7' },
  },
  "abcdefx": {
    fantom: { factory: '0x01f43d2a7f4554468f77e06757e707150e39130c' },
    kcc: { factory: '0x01f43d2a7f4554468f77e06757e707150e39130c' },
    kava: { factory: '0x01f43d2a7f4554468f77e06757e707150e39130c' },
  },
  "alita-finance": {
    bsc: { factory: '0xC7a506ab3ac668EAb6bF9eCf971433D6CFeF05D9' },
  },
  "archerswap": {
    core: { factory: '0xe0b8838e8d73ff1CA193E8cc2bC0Ebf7Cf86F620' },
  },
  "astroswap": {
    velas: { factory: '0xe82d721A6CdeC2f86e9Fca074Ff671c8621F8459' },
  },
  "auroraswap": {
    aurora: { factory: '0xC5E1DaeC2ad401eBEBdd3E32516d90Ab251A3aA3' },
  },
  "champagneswap": {
    bsc: { factory: '0xb31A337f1C3ee7fA2b2B83c6F8ee0CA643D807a0' },
  },
  "chronos": {
    arbitrum: { factory: '0xCe9240869391928253Ed9cc9Bcb8cb98CB5B0722' },
  },
  "cryptoswap": {
    bsc: { factory: '0x4136A450861f5CFE7E860Ce93e678Ad12158695C' },
  },
  "defi-kingdoms": {
    harmony: { factory: '0x9014B937069918bd319f80e8B3BB4A2cf6FAA5F7' },
  },
  "deltaswap": {
    arbitrum: { factory: '0xcb85e1222f715a81b8edaeb73b28182fa37cffa8' },
    base: { factory: '0x9a9a171c69cc811dc6b59bb2f9990e34a22fc971' },
    ethereum: { factory: '0x5fbe219e88f6c6f214ce6f5b1fcaa0294f31ae1b' },
  },
  "equalizer-exchange": {
    fantom: { factory: '0xc6366efd0af1d09171fe0ebf32c7943bb310832a' },
    sonic: { factory: '0xDDD9845Ba0D8f38d3045f804f67A1a8B9A528FcC' },
  },
  "equilibre": {
    kava: { factory: '0xA138FAFc30f6Ec6980aAd22656F2F11C38B56a95' },
  },
  "heraswap": {
    onus: { factory: '0x6CD368495D90b9Ba81660e2b35f7Ea2AcE2B8cD6' },
  },
  "hermes-protocol": {
    metis: { factory: '0x633a093C9e94f64500FC8fCBB48e90dd52F6668F' },
  },
  "jswap": {
    okexchain: { factory: '0xd654CbF99F2907F06c88399AE123606121247D5C' },
  },
  "kyotoswap": {
    bsc: { factory: '0x1c3E50DBBCd05831c3A695d45D2b5bCD691AD8D8' },
  },
  "luigiswap": {
    scroll: { factory: '0x0dAe6d22182c20AB9150a4DCB3160591Dc41027a' },
  },
  "merchant-moe": {
    mantle: { factory: '0x5bef015ca9424a7c07b68490616a4c1f094bedec' },
  },
  "meridian-swap": {
    telos: { factory: '0x1F2542D8F784565D526eeaDC9F1ca8Fbb75e5996' },
  },
  "miaswap": {
    onus: { factory: '0xA5DA4dC244c7aD33a0D8a10Ed5d8cFf078E86Ef3' },
  },
  "mistswap": {
    smartbch: { factory: '0x6008247F53395E7be698249770aa1D2bfE265Ca0' },
  },
  "nearpad": {
    aurora: { factory: '0x34484b4E416f5d4B45D4Add0B6eF6Ca08FcED8f1' },
  },
  "okcswap": {
    okexchain: { factory: '0x7b9F0a56cA7D20A44f603C03C6f45Db95b31e539' },
  },
  "pearl-v1-5": {
    real: { factory: '0xAed0A784f357BE9C3f8113BB227a7517a3444Afe' },
  },
  "pearlfi": {
    polygon: { factory: '0xEaF188cdd22fEEBCb345DCb529Aa18CA9FcB4FBd' },
  },
  "photonswap-finance": {
    cronos: { factory: '0x462C98Cae5AffEED576c98A55dAA922604e2D875' },
  },
  "ramses-exchange": {
    arbitrum: { factory: '0xaaa20d08e59f6561f242b08513d36266c5a29415' },
  },
  "satoshiswap": {
    core: { factory: '0x8f5c03a1c86bf79ae0baC0D72E75aee662083e26' },
  },
  "solidlizard": {
    arbitrum: { factory: '0x734d84631f00dC0d3FCD18b04b6cf42BFd407074' },
  },
  "soulswap": {
    fantom: { factory: '0x1120e150dA9def6Fe930f4fEDeD18ef57c0CA7eF' },
  },
  "soy-finance": {
    callisto: { factory: '0x9CC7C769eA3B37F1Af0Ad642A268b80dc80754c5' },
  },
  "trisolaris": {
    aurora: { factory: '0xc66F594268041dB60507F00703b152492fb176E7' },
  },
  "unicly": {
    ethereum: { factory: '0xbacc776b231c571a7e6ab7bc2c8a099e07153377' },
  },
  "verse": {
    ethereum: { factory: '0xee3E9E46E34a27dC755a63e2849C9913Ee1A06E2' },
    smartbch: { factory: '0x16bc2B187D7C7255b647830C05a6283f2B9A3AF8' },
  },
  "voltage": {
    fuse: { factory: '0x1998E4b0F1F922367d8Ec20600ea2b86df55f34E' },
  },
  "wagyuswap": {
    velas: { factory: '0x69f3212344a38b35844cce4864c2af9c717f35e3' },
  },
  "wannaswap": {
    aurora: { factory: '0x7928D4FeA7b2c90C732c10aFF59cf403f0C38246' },
  },
  "wigoswap": {
    fantom: { factory: '0xc831a5cbfb4ac2da5ed5b194385dfd9bf5bfcba7' },
  },
  "wineryswap": {
    bsc: { factory: '0x79C342FddBBF376cA6B4EFAc7aaA457D6063F8Cb' },
  },
  "wojak-finance": {
    dogechain: { factory: '0xc7c86B4f940Ff1C13c736b697e3FbA5a6Bc979F9' },
  },
  "yieldfields": {
    bsc: { factory: '0x0A376eE063184B444ff66a9a22AD91525285FE1C' },
  },
  "yoshi-exchange": {
    fantom: { factory: '0xc5bc174cb6382fbab17771d05e6a918441deceea' },
    bsc: { factory: '0x542b6524abf0bd47dc191504e38400ec14d0290c' },
    ethereum: { factory: '0x773cadc167deafa46f603d96172fa45686c4fa58' },
  },
  "Omnidrome": {
    zeta: { factory: '0x769d1BcB5FDf30F5a9D19f1ab8A3cF8b60a6e855' },
  },
  "nuri-exchange-v1": {
    scroll: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57' },
  },
  "leonicornswap": {
    bsc: { factory: '0xEB10f4Fe2A57383215646b4aC0Da70F8EDc69D4F', fees: 0.003 },
  },
  "mm-finance-arbitrum": {
    arbitrum: { factory: '0xfe3699303D3Eb460638e8aDA2bf1cFf092C33F22', fees: 0.003 },
  },
  "morpheus-swap": {
    fantom: { factory: '0x9C454510848906FDDc846607E4baa27Ca999FBB6', fees: 0.003 },
  },
  "3xcalibur": {
    arbitrum: { factory: '0xD158bd9E8b6efd3ca76830B66715Aa2b7Bad2218', start: '2022-11-06' },
  },
  "wardenswap": {
    bsc: { factory: '0x3657952d7bA5A0A4799809b5B6fdfF9ec5B46293', start: '2021-06-23' },
  },
  "velodrome": {
    optimism: { factory: '0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746', fees: 0.0005, stableFees: 0.0002, start: '2023-02-23' },
  },
  "bitgenie-amm": {
    merlin: { factory: '0xEa51E2E458aE7Cb921d47fC463Ac4fED7ae65a41' },
  },
  "blasterswap": {
    blast: { factory: '0x9CC1599D4378Ea41d444642D18AA9Be44f709ffD' },
  },
  "cleopatra-v2": {
    mantle: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57' },
  },
  "eddyfinance-v2": {
    zeta: { factory: '0x9fd96203f7b22bCF72d9DCb40ff98302376cE09c' },
  },
  "infusion": {
    base: { factory: '0x2D9A3a2bd6400eE28d770c7254cA840c82faf23f' },
  },
  "kim-exchange-v2": {
    mode: { factory: '0xc02155946dd8C89D3D3238A6c8A64D04E2CD4500' },
  },
  "nova-fi": {
    abstract: { factory: '0xE1e98623082f662BCA1009a05382758f86F133b3' },
  },
  "omax-swap": {
    omax: { factory: '0x441b9333D1D1ccAd27f2755e69d24E60c9d8F9CF' },
  },
  "thruster-v2": {
    blast: { factory: '0xb4A7D971D0ADea1c73198C97d7ab3f9CE4aaFA13' },
  },
  "vanillaswap-v2": {
    defichain_evm: { factory: '0x79Ea1b897deeF37e3e42cDB66ca35DaA799E93a3' },
  },
  "vapordex-v1": {
    avax: { factory: '0xc009a670e2b02e21e7e75ae98e254f467f7ae257' },
    apechain: { factory: '0xc009a670e2b02e21e7e75ae98e254f467f7ae257' },
  },
  "archly-finance-v2": {
    arbitrum_nova: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    arbitrum: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    avax: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    base: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    blast: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    bsc: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    cronos: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    ethereum: { factory: '0xE8E2b714C57937E0b29c6ABEAF00B52388cAb598' },
    fantom: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    filecoin: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    fraxtal: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    kava: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    mantle: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    metis: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    mode: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    neon_evm: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    optimism: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    polygon: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    sonic: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    telos: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
    era: { factory: '0x30A0DD3D0D9E99BD0E67b323FB706788766dCff2' },
    zora: { factory: '0x12508dd9108Abab2c5fD8fC6E4984E46a3CF7824' },
  },
  // with fee ratios / options / methodology
  "solidly": {
    fantom: { factory: '0x3fAaB499b519fdC5819e3D7ed0C26111904cbc28', fees: 0.002, stableFees: 0.0001, start: '2022-02-10', revenueRatio: 1, protocolRevenueRatio: 0, holdersRevenueRatio: 1, userFeesRatio: 1 },
  },
  "icecreamswap": {
    bitgert: { factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f', fees: 0.003, revenueRatio: 1 / 6, userFeesRatio: 1 },
    core: { factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f', fees: 0.003, revenueRatio: 1 / 6, userFeesRatio: 1 },
  },
  "auragi": {
    arbitrum: { factory: '0xa36b55DBe8e83Eb69C686368cF93ABC8A238CC5f' },
  },
  "fcon-dex": {
    mantle: { factory: '0x3eF942017d51BA257c4B61BE2f8f641209C8b341' },
  },
  "zkSwap_Finance": {
    era: { factory: '0x3a76e377ed58c8731f9df3a36155942438744ce3', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.067 / 0.2, protocolRevenueRatio: 1 },
    sonic: { factory: '0xCe98a0E578b639AA90EE96eD5ba8E5a4022de529', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.067 / 0.2, protocolRevenueRatio: 1 },
    monad: { factory: '0x0ff16867BcaC3C5fdc2dc73558e3F8e2ed89EEA2', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.067 / 0.2, protocolRevenueRatio: 1 },
  },
  "velodrome-v2": {
    optimism: { factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a', swapEvent: velodromeSwapEvent },
    mode: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    lisk: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    fraxtal: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    ink: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    bob: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    soneium: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    unichain: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    swellchain: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
    celo: { factory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0', swapEvent: velodromeSwapEvent },
  },
  "dyorswap": {
    mode: { factory: '0xE470699f6D0384E3eA68F1144E41d22C6c8fdEEf', start: '2023-11-20', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    blast: { factory: '0xA1da7a7eB5A858da410dE8FBC5092c2079B58413', start: '2024-03-01', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    plasma: { factory: '0xA9F2c3E18E22F19E6c2ceF49A88c79bcE5b482Ac', start: '2025-09-27', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "SwapX-v2": {
    sonic: { factory: '0x05c1be79d3aC21Cc4B727eeD58C9B2fF757F5663', start: '2024-12-23', stableFees: 0.001 },
  },
  "squadswap-dynamo": {
    bsc: { factory: '0x918Adf1f2C03b244823Cd712E010B6e3CD653DbA', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "squadswap-v2": {
    bsc: { factory: '0x1D9F43a6195054313ac1aE423B1f810f593b6ac1', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "babydogeswap": {
    bsc: { factory: '0x4693B62E5fc9c0a45F89D62e6300a03C85f43137', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.1 / 0.3, protocolRevenueRatio: 1 },
  },
  "hydrometer": {
    base: { factory: '0xF60caCf0A3daa5B6a79ca6594BEF38F85391AE0A', swapEvent: velodromeSwapEvent },
  },
  "jibswap": {
    jbc: { factory: '0x4BBdA880C5A0cDcEc6510f0450c6C8bC5773D499', start: '2023-12-13' },
  },
  "keller": {
    scroll: { factory: '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367' },
  },
  "kinetix-v2": {
    kava: { factory: '0xE8E917BC80A26CDacc9aA42C0F4965d2E1Fa52da' },
    base: { factory: '0x8aD3d3e6B1b7B65138bD508E48330B544539b2C3' },
  },
  "nile-exchange-v1": {
    linea: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57', revenueRatio: 0.8, userFeesRatio: 1, protocolRevenueRatio: 0.05, holdersRevenueRatio: 0.75 },
  },
  "smartdex": {
    polygon: { factory: '0xBE087BeD88539d28664c9998FE3f180ea7b9749C', userFeesRatio: 1, revenueRatio: 0 },
  },
  "xswap-protocol": {
    xdc: { factory: '0x347D14b13a68457186b2450bb2a6c2Fd7B38352f', userFeesRatio: 1, revenueRatio: 0 },
  },
  "babyswap": {
    bsc: { factory: '0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da', userFeesRatio: 1, revenueRatio: 0 },
  },
  "gin-finance": {
    boba: { factory: '0x06350499760aa3ea20FEd2837321a84a92417f39', userFeesRatio: 1, revenueRatio: 0 },
  },
  "cl-dex": {
    klaytn: { factory: '0x2A4C5eCaafB26460F17d509EA4d15741AF5F5f0a', userFeesRatio: 1, protocolRevenueRatio: 0.3, revenueRatio: 0.3, holdersRevenueRatio: 0 },
  },
  "lynex-v1": {
    linea: { factory: '0xbc7695fd00e3b32d08124b7a4287493aee99f9ee', start: '2024-02-11', fees: 0.0025, stableFees: 0.0001, userFeesRatio: 1, revenueRatio: 1, protocolRevenueRatio: 0, holdersRevenueRatio: 1 },
  },
  "gt3": {
    polygon: { factory: '0x2d7360Db7216792cfc2c73B79C0cA629007E2af4', start: '2025-04-23' },
  },
  "9mm-v2": {
    pulse: { factory: '0x3a0Fa7884dD93f3cd234bBE2A0958Ef04b05E13b', fees: 0.0025, revenueRatio: 0.08 / 0.25, protocolRevenueRatio: 0.08 / 0.25 },
    base: { factory: '0x4c1b8D4ae77A37b94e195CAB316391d3C687ebd1', fees: 0.0025, revenueRatio: 0.08 / 0.25, protocolRevenueRatio: 0.08 / 0.25 },
    sonic: { factory: '0x0f7B3FcBa276A65dd6E41E400055dcb75BA66750', fees: 0.0025, revenueRatio: 0.08 / 0.25, protocolRevenueRatio: 0.08 / 0.25 },
  },
  "canto-dex": {
    canto: { factory: '0xE387067f12561e579C5f7d4294f51867E0c1cFba', blacklistedAddresses: ['0x76200899Ee4CCAC8FCa5CF3E6976BAE71e25f3ED'] },
  },
  "solarbeam": {
    moonriver: { factory: '0x049581aEB6Fe262727f290165C29BDAB065a1B68', start: '2021-09-06', fees: 0.0025, revenueRatio: 0.2, protocolRevenueRatio: 0.2, holdersRevenueRatio: 0 },
  },
  "spiritswap": {
    fantom: { factory: '0xEF45d134b73241eDa7703fa787148D9C9F4950b0', start: '2021-05-13', fees: 0.003, revenueRatio: 0.0005 / 0.003, protocolRevenueRatio: 0.0005 / 0.003 },
  },
  "stellaswap": {
    moonbeam: { factory: '0x68A384D826D3678f78BB9FB1533c7E9577dACc0E', fees: 0.0025, revenueRatio: 0.2, protocolRevenueRatio: 0.2 },
  },
  "supswap-v2": {
    mode: { factory: '0x557f46F67a36E16Ff27e0a39C5DA6bFCB4Ff89c0', start: '2024-01-27', fees: 0.002, revenueRatio: 0.25 },
  },
  "velocimeter-v2": {
    canto: { factory: '0xF80909DF0A01ff18e4D37BF682E40519B21Def46' },
  },
  "velocimeter-v4": {
    iotaevm: { factory: '0x10A288eF87586BE54ea690998cAC82F7Cc90BC50', fees: 0.0025, voter: '0x6c9BB73106501c6E0241Fe8E141620868b3F0096' },
  },
  "viperswap": {
    harmony: { factory: '0x7d02c116b98d0965ba7b642ace0183ad8b8d2196' },
  },
  "arena-dex": {
    avax: { factory: '0xF16784dcAf838a3e16bEF7711a62D12413c39BD1', fees: 0.003, revenueRatio: 1, start: '2025-04-23' },
  },
  "diviswap": {
    chz: { factory: '0xBDd9c322Ecf401E09C9D2Dca3be46a7E45d48BB1', start: '2024-04-08', revenueRatio: 0.3, protocolRevenueRatio: 0.3, holdersRevenueRatio: 0 },
  },
  "fanx-protocol": {
    chz: { factory: '0xE2918AA38088878546c1A18F2F9b1BC83297fdD3', start: '2024-04-01', revenueRatio: 0.5, protocolRevenueRatio: 0.5, holdersRevenueRatio: 0 },
  },
  "kodiak-v2": {
    berachain: { factory: '0x5e705e184d233ff2a7cb1553793464a9d0c3028f', revenueRatio: 0.1667, protocolRevenueRatio: 0.1667, holdersRevenueRatio: 0, userFeesRatio: 1 },
  },
  "moai-v2": {
    xrplevm: { factory: '0x645541A2e2fb655fd7765898DFfbc7dd051E5B67', revenueRatio: 0 },
  },
  "octoswap-classic": {
    monad: { factory: '0xCe104732685B9D7b2F07A09d828F6b19786cdA32', revenueRatio: 1 / 6, protocolRevenueRatio: 1 / 6 },
  },
  "pharaoh-v2": {
    avax: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57', revenueRatio: 1, holdersRevenueRatio: 1 },
  },
  "swapmode-v2": {
    mode: { factory: '0xfb926356BAf861c93C3557D7327Dbe8734A71891', start: '2024-02-02', userFeesRatio: 1, revenueRatio: 0.8, protocolRevenueRatio: 0.8 },
  },
  "parity-dex": {
    monad: { factory: '0x6DBb0b5B201d02aD74B137617658543ecf800170', start: '2026-02-11', stableFees: 0.0004, userFeesRatio: 1, revenueRatio: 1, protocolRevenueRatio: 0.1, holdersRevenueRatio: 0.9 },
  },
  "swyrl-legacy": {
    monad: { factory: '0xD158CDfeC90E9429A290c3144Afeb72E8C23603a' },
  },
  "purps": {
    monad: { factory: '0xAfE4d3eB898591ACe6285176b26f0F5BEb894447', userFeesRatio: 1, revenueRatio: 0.2, protocolRevenueRatio: 0.2 },
  },
  "hunnyswap": {
    avax: { factory: '0x0c6A0061F9D0afB30152b8761a273786e51bec6d', start: '2022-06-06', userFeesRatio: 1, revenueRatio: 0.12 / 0.3, protocolRevenueRatio: 0.02 / 0.3, holdersRevenueRatio: 0.1 / 0.3 },
  },
  "hybra-v2": {
    hyperliquid: { factory: '0x9c7397c9C5ecC400992843408D3A283fE9108009', start: '2025-05-22', fees: 0.0025, stableFees: 0.0002, userFeesRatio: 1, revenueRatio: 0.12, protocolRevenueRatio: 0.12 },
  },
  "superswap-v2": {
    optimism: { factory: '0x22505cb4d5d10b2c848a9d75c57ea72a66066d8c', userFeesRatio: 1, revenueRatio: 0.8, protocolRevenueRatio: 0.8 },
  },
  "madness-finance": {
    monad: { factory: '0x93d71152A93619c0b10A2EFc856AC46120FD01Ab', userFeesRatio: 1, revenueRatio: 0 },
  },
  "currentx": {
    megaeth: { factory: '0xC60940F182F7699522970517f6d753A560546937', start: '2026-02-05', userFeesRatio: 1, revenueRatio: 0 },
  },
  "daoaas-swap": {
    eni: { factory: '0x548C0E26CE90B333c07abb6d55546304D46d269d', start: '2025-06-01' },
  },
  "mute.io": {
    era: { factory: '0x40be1cba6c5b47cdf9da7f963b6f761f4c60627d', start: 1679529600, userFeesRatio: 1, revenueRatio: 0.2, protocolRevenueRatio: 0.2 },
  },
  "archly-finance": {
    telos: { factory: '0x39fdd4Fec9b41e9AcD339a7cf75250108D32906c' },
  },
  "pandoraswap": {
    astar: { factory: '0x8D4f9b98FC21787382647BFCfC9ce75C08B50481', userFeesRatio: 1, revenueRatio: 0 },
  },
  "auraswap": {
    polygon: { factory: '0x015DE3ec460869eb5ceAe4224Dc7112ac0a39303', userFeesRatio: 1, revenueRatio: 0 },
  },
  "solarflare": {
    moonbeam: { factory: '0x19B85ae92947E0725d5265fFB3389e7E4F191FDa', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.12, holdersRevenueRatio: 0.2 },
  },
  "swappi": {
    conflux: { factory: '0xe2a6f7c0ce4d5d300f97aa7e125455f5cd3342f5', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.12, holdersRevenueRatio: 0.2 },
  },
  "sushiswap-classic": {
    ethereum: { factory: '0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac', start: '2020-09-05', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    avax: { factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', start: '2021-03-10', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    fuse: { factory: '0x43eA90e2b786728520e4f930d2A71a477BF2737C', start: '2021-09-15', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    arbitrum: { factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', start: '2021-04-01', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    polygon: { factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', start: '2021-03-01', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    bsc: { factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', start: '2021-03-01', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    core: { factory: '0xb45e53277a7e0f1d35f2a77160e91e25507f1763', start: '2023-11-01', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    blast: { factory: '0x42fa929fc636e657ac568c0b5cf38e203b67ac2b', start: '2024-03-03', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    katana: { factory: '0x72d111b4d6f31b38919ae39779f570b747d6acd9', start: '2025-04-01', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    xdai: { factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', start: '2021-03-01', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    optimism: { factory: '0xfbc12984689e5f15626bad03ad60160fe98b303c', start: '2023-10-16', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    base: { factory: '0x71524b4f93c58fcbf659783284e38825f0622859', start: '2023-08-15', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    sonic: { factory: '0xb45e53277a7e0f1d35f2a77160e91e25507f1763', start: '2024-12-13', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    celo: { factory: '0xc35dadb65012ec5796536bd9864ed8773abc74c4', start: '2021-06-17', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    linea: { factory: '0xfbc12984689e5f15626bad03ad60160fe98b303c', start: '2023-10-15', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
    metis: { factory: '0x580ED43F3BBa06555785C81c2957efCCa71f7483', start: '2023-10-15', userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 0, holdersRevenueRatio: 1 / 6, allowReadPairs: true },
  },
  "camelot": {
    apechain: { factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', start: '2024-10-15', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.175, holdersRevenueRatio: 0.225 },
    arbitrum: { factory: '0x6EcCab422D763aC031210895C81787E87B43A652', start: '2022-11-22', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.175, holdersRevenueRatio: 0.225 },
    gravity: { factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', start: '2024-07-04', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.175, holdersRevenueRatio: 0.225 },
    rari: { factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', start: '2024-06-05', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.175, holdersRevenueRatio: 0.225 },
    reya: { factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', start: '2024-06-20', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.175, holdersRevenueRatio: 0.225 },
    // sanko: { factory: '0x7d8c6B58BA2d40FC6E34C25f9A488067Fe0D2dB4', start: '2024-04-17', fees: 0.003, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.175, holdersRevenueRatio: 0.225 },
  },
  "apeswap": {
    bsc: { factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6', start: 1613273226, fees: 0.002, userFeesRatio: 1, revenueRatio: 0.15, protocolRevenueRatio: 0, holdersRevenueRatio: 0.15 },
    polygon: { factory: '0xcf083be4164828f00cae704ec15a36d711491284', start: 1623814026, fees: 0.002, userFeesRatio: 1, revenueRatio: 0.15, protocolRevenueRatio: 0, holdersRevenueRatio: 0.15 },
    ethereum: { factory: '0xBAe5dc9B19004883d0377419FeF3c2C8832d7d7B', start: 1652239626, fees: 0.002, userFeesRatio: 1, revenueRatio: 0.15, protocolRevenueRatio: 0, holdersRevenueRatio: 0.15 },
    arbitrum: { factory: '0xCf083Be4164828f00cAE704EC15a36D711491284', start: 1678406400, fees: 0.002, userFeesRatio: 1, revenueRatio: 0.15, protocolRevenueRatio: 0, holdersRevenueRatio: 0.15 },
  },
  "jetswap": {
    bsc: { factory: '0x0eb58E5c8aA63314ff5547289185cC4583DfCBD5', userFeesRatio: 1, revenueRatio: 0.05 / 0.3, protocolRevenueRatio: 0.05 / 0.3, blacklistedAddresses: ['0x81eE41C232e2c7fba40c9EaC02ae1eAE33570382'] },
    polygon: { factory: '0x668ad0ed2622C62E24f0d5ab6B6Ac1b9D2cD4AC7', userFeesRatio: 1, revenueRatio: 0.5, protocolRevenueRatio: 0.5 },
    fantom: { factory: '0xf6488205957f0b4497053d6422F49e27944eE3Dd', userFeesRatio: 1, revenueRatio: 0.5, protocolRevenueRatio: 0.5 },
  },
  "spookyswap": {
    fantom: { factory: '0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3', start: '2021-04-18', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.15, protocolRevenueRatio: 0, holdersRevenueRatio: 0.15 },
    sonic: { factory: '0xEE4bC42157cf65291Ba2FE839AE127e3Cc76f741', start: '2024-12-12', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.15, protocolRevenueRatio: 0, holdersRevenueRatio: 0.15 },
  },
  "biswap": {
    bsc: { factory: '0x858e3312ed3a876947ea49d572a7c42de08af7ee', start: '2021-05-24', fees: 0.002 },
  },
  "honeyswap": {
    polygon: { factory: '0x03daa61d8007443a6584e3d8f85105096543c19c', start: 1622173831 },
    xdai: { factory: '0xa818b4f111ccac7aa31d0bcc0806d64f2e0737d7', start: 1599191431 },
  },
  "echodex": {
    linea: { factory: '0x6D1063F2187442Cc9adbFAD2f55A96B846FCB399', start: 1689638400, swapEvent: echodexSwapEvent },
  },
  "elk": {
    xdai: { factory: '0xCB018587dA9590A18f49fFE2b85314c33aF3Ad3B', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    polygon: { factory: '0xE3BD06c7ac7E1CeB17BdD2E5BA83E40D1515AF2a', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    fantom: { factory: '0x7Ba73c99e6f01a37f3e33854c8F544BbbadD3420', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    bsc: { factory: '0x31aFfd875e9f68cd6Cd12Cee8943566c9A4bBA13', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    avax: { factory: '0x091d35d7F63487909C863001ddCA481c6De47091', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    moonriver: { factory: '0xd45145f10fD4071dfC9fC3b1aefCd9c83A685e77', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    ethereum: { factory: '0x6511eBA915fC1b94b2364289CCa2b27AE5898d80', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    optimism: { factory: '0xedfad3a0F42A8920B011bb0332aDe632e552d846', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    arbitrum: { factory: '0xA59B2044EAFD15ee4deF138D410d764c9023E1F0', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    metis: { factory: '0xfbb4E52FEcc90924c79F980eb24a9794ae4aFFA4', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    base: { factory: '0xfbb4E52FEcc90924c79F980eb24a9794ae4aFFA4', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    linea: { factory: '0xfbb4E52FEcc90924c79F980eb24a9794ae4aFFA4', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "empiredex": {
    bsc: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    cronos: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    xdai: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    polygon: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    fantom: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    avax: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    ethereum: { factory: '0xd674b01E778CF43D3E6544985F893355F46A74A5', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    kava: { factory: '0x06530550A48F990360DFD642d2132354A144F31d', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "swapr": {
    ethereum: { factory: '0xd34971BaB6E5E356fd250715F5dE0492BB070452', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
    arbitrum: { factory: '0x359f20ad0f42d75a5077e65f30274cabe6f4f01a', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
    xdai: { factory: '0x5d48c95adffd4b40c1aaadc4e08fc44117e02179', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "swapsicle": {
    avax: { factory: '0x9c60c867ce07a3c403e2598388673c10259ec768', userFeesRatio: 1, revenueRatio: 0 },
    polygon: { factory: '0x735ab9808d792B5c8B54e31196c011c26C08b4ce', userFeesRatio: 1, revenueRatio: 0 },
    bsc: { factory: '0xEe673452BD981966d4799c865a96e0b92A8d0E45', userFeesRatio: 1, revenueRatio: 0 },
    fantom: { factory: '0x98F23162E3a7FE610aC89C88E4217a599A15858F', userFeesRatio: 1, revenueRatio: 0 },
    arbitrum: { factory: '0x2f0c7c98462651bb2102f6cd05acdad333e031b0', userFeesRatio: 1, revenueRatio: 0 },
    ethereum: { factory: '0x2f0c7c98462651bb2102f6cd05acdad333e031b0', userFeesRatio: 1, revenueRatio: 0 },
    optimism: { factory: '0x2f0c7c98462651bb2102f6cd05acdad333e031b0', userFeesRatio: 1, revenueRatio: 0 },
    telos: { factory: '0xB630F53DF13645BFF0Ef55eB44a8a490a7DD4514', userFeesRatio: 1, revenueRatio: 0 },
  },
  "dackieswap-v2": {
    base: { factory: '0x591f122d1df761e616c13d265006fcbf4c6d6551', userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32 },
    optimism: { factory: '0xaedc38bd52b0380b2af4980948925734fd54fbf4', userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32 },
    arbitrum: { factory: '0x507940c2469e6e3b33032f1d4ff8d123bdde2f5c', userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32 },
    blast: { factory: '0xf5190e64db4cbf7ee5e72b55cc5b2297e20264c2', userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32 },
    mode: { factory: '0x757cd583004400ee67e5cc3c7a60c6a62e3f6d30', userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32 },
    linea: { factory: '0x9790713770039cefcf4faaf076e2846c9b7a4630', userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32 },
  },
  "traderjoe-v1": {
    [CHAIN.BSC]: { factory: '0x4f8bdc85e3eec5b9de67097c3f59b6db025d9986', start: '2022-10-04', fees: 0.003, revenueRatio: 0.0005 / 0.003, holdersRevenueRatio: 0.0005 / 0.003, },
    [CHAIN.AVAX]: { factory: '0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10', start: '2021-08-09', fees: 0.003, revenueRatio: 0.0005 / 0.003, holdersRevenueRatio: 0.0005 / 0.003, },
  },
  "tethys-finance": {
    metis: { factory: '0x2CdFB20205701FF01689461610C9F321D1d00F80', start: '2021-12-18', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.3, protocolRevenueRatio: 0, holdersRevenueRatio: 0.3 },
  },
  "sphynx": {
    bsc: { factory: '0x8BA1a4C24DE655136DEd68410e222cCA80d43444', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    cronos: { factory: '0x5019EF5dd93A7528103BB759Bb2F784D065b826a', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "sparkdex-v2": {
    flare: { factory: '0x16b619B04c961E8f4F06C10B42FDAbb328980A89', start: '2024-06-27', userFeesRatio: 1, revenueRatio: 0 },
  },
  "hyperswap-v2": {
    hyperliquid: { factory: '0x724412C00059bf7d6ee7d4a1d0D5cd4de3ea1C48', start: '2025-02-18', userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.08, holdersRevenueRatio: 0.32 },
  },
  "enosys-v2": {
    flare: { factory: '0x28b70f6Ed97429E40FE9a9CD3EB8E86BCBA11dd4', start: '2023-09-05', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
    songbird: { factory: '0x7a39408809441814469A8Fb3F5CFea1aA2774fB6', start: '2021-11-19', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "fenix-finance": {
    blast: { factory: '0xa19c51d91891d3df7c13ed22a2f89d328a82950f', fees: 0.001, stableFees: 0.0003, userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "dystopia": {
    polygon: { factory: '0x1d21Db6cde1b18c7E47B0F7F42f4b3F68b9beeC9', start: 1652932015, fees: 0.002, userFeesRatio: 1, revenueRatio: 0 },
  },
  "wingswap": {
    fantom: { factory: '0xc0719a9A35a2D9eBBFdf1C6d383a5E8E7b2ef7a8', start: 1637452800, userFeesRatio: 1, revenueRatio: 0 },
  },
  "complus-network": {
    polygon: { factory: '0x973c934137dd687eca67bdd1c5a8b74286964ac6', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    bsc: { factory: '0xdf97982bf70be91df4acd3d511c551f06a0d19ec', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
    avax: { factory: '0x5c02e78a3969d0e64aa2cfa765acc1d671914ac0', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "gravis": {
    bsc: { factory: '0x4a3b76860c1b76f0403025485de7bfa1f08c48fd', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
    polygon: { factory: '0x17c1d25d5a2d833c266639de5fbe8896bdbeb234', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
  },
  "zkswap": {
    era: { factory: '0xeeE1Af1CE68D280e9cAfD861B7d4af776798F18d', userFeesRatio: 1, revenueRatio: 1, protocolRevenueRatio: 1 },
  },
  "titano-swych": {
    bsc: { factory: '0x80f112CD8Ac529d6993090A0c9a04E01d495BfBf', start: 1648005393, fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
  },
  "zebra-v1": {
    scroll: { factory: '0xa63eb44c67813cad20A9aE654641ddc918412941', start: 1698364800, userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
  },
  "zipswap": {
    arbitrum: { factory: '0x9e343Bea27a12B23523ad88333a1B0f68cc1F05E', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "autoshark": {
    bsc: { factory: '0xe759Dd4B9f99392Be64f1050a6A8018f73B53a13', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "blue-planet": {
    bsc: { factory: '0xa053582601214FEb3778031a002135cbBB7DBa18', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
  },
  "cometh": {
    polygon: { factory: '0x800b052609c355cA8103E06F022aA30647eAd60a', start: 1622518288, fees: 0.005, userFeesRatio: 1, revenueRatio: 0 },
  },
  "crodex": {
    cronos: { factory: '0xe9c29cB475C0ADe80bE0319B74AD112F1e80058F', start: '2021-12-01', userFeesRatio: 1, revenueRatio: 0 },
  },
  "dinosaur-eggs": {
    bsc: { factory: '0x73d9f93d53505cb8c4c7f952ae42450d9e859d10', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "gravity-finance": {
    polygon: { factory: '0x3ed75AfF4094d2Aaa38FaFCa64EF1C152ec1Cf20', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
  },
  "hakuswap": {
    avax: { factory: '0x2Db46fEB38C57a6621BCa4d97820e1fc1de40f41', fees: 0.002, userFeesRatio: 1, revenueRatio: 0 },
  },
  "huckleberry": {
    moonriver: { factory: '0x017603C8f29F7f6394737628a93c57ffBA1b7256', start: '2021-09-26', userFeesRatio: 1, revenueRatio: 0 },
  },
  "ocelex-v1": {
    zircuit: { factory: '0xdd018347c29a27088eb2d0bf0637d9a05b30666c', start: '2024-10-25', fees: 0.0018, stableFees: 0.0004, userFeesRatio: 1, revenueRatio: 1, protocolRevenueRatio: 1 },
  },
  "oolongswap": {
    boba: { factory: '0x7DDaF116889D655D1c486bEB95017a8211265d29', start: 1635938988, userFeesRatio: 1, revenueRatio: 1 / 6, protocolRevenueRatio: 1 / 6 },
  },
  "pandora": {
    bsc: { factory: '0xFf9A4E72405Df3ca3D909523229677e6B2b8dC71', start: 1652757593, userFeesRatio: 1, revenueRatio: 0 },
  },
  "protofi": {
    fantom: { factory: '0x39720E5Fe53BEEeb9De4759cb91d8E7d42c17b76', fees: 0.003, userFeesRatio: 1, revenueRatio: 0 },
  },
  "alienfi": {
    arbitrum: { factory: '0xac9d019B7c8B7a4bbAC64b2Dbf6791ED672ba98B', start: 1676505600, fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
  },
  "benswap": {
    bsc: { factory: '0x4dC6048552e2DC6Eb1f82A783E859157d40FA193', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
    smartbch: { factory: '0x8d973bAD782c1FFfd8FcC9d7579542BA7Dd0998D', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
  },
  "subzero-zswap": {
    avax: { factory: '0xcDE3F9e6D452be6d955B1C7AaAEE3cA397EAc469', start: 1675814400, fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 },
  },
  "carbonswap": {
    energyweb: { factory: '0x17854c8d5a41d5A89B275386E24B2F38FD0AfbDd', start: 1618446893 },
  },
  "cone": {
    bsc: { factory: '0x0EFc2D2D054383462F2cD72eA2526Ef7687E1016', start: 1626677527 },
  },
  "padswap": {
    bsc: { factory: '0xB836017ACf10b8A7c6c6C9e99eFE0f5B0250FC45', start: 1620518400 },
    moonriver: { factory: '0x760d2Bdb232027aB3b1594405077F9a1b91C04c1', start: 1635638400 },
    moonbeam: { factory: '0x663a07a2648296f1A3C02EE86A126fE1407888E5', start: 1642032000 },
  },
  "pegasys": {
    syscoin: { factory: '0x7Bbbb6abaD521dE677aBe089C85b29e3b2021496' },
  },
  "pinkswap": {
    bsc: { factory: '0x7D2Ce25C28334E40f37b2A068ec8d5a59F11Ea54' },
  },
  "polycat": {
    polygon: { factory: '0x477Ce834Ae6b7aB003cCe4BC4d8697763FF456FA' },
  },
  "ultronswap": {
    ultron: { factory: '0xe1F0D4a5123Fd0834Be805d84520DFDCd8CF00b7', start: 1659323793 },
  },
  "ampleswap": {
    bsc: { factory: '0x381fefadab5466bff0e8e96842e8e76a143e8f73', start: '2021-09-10' },
  },
  "bxh": {
    bsc: { factory: '0x7897c32cbda1935e97c0b59f244747562d4d97c1' },
    ethereum: { factory: '0x8d0fCA60fDf50CFE65e3E667A37Ff3010D6d1e8d' },
    avax: { factory: '0xDeC9231b2492ccE6BA01376E2cbd2bd821150e8C' },
  },
  "dao-swap": {
    bsc: { factory: '0x940BEb635cbEeC04720AC97FADb97205676e6aa4', start: 1663921255 },
  },
  "netswap": {
    metis: { factory: '0x70f51d68D16e8f9e418441280342BD43AC9Dff9f', start: 1638760703, fees: 0.003, userFeesRatio: 1, revenueRatio: 0.05 / 0.3, protocolRevenueRatio: 1 },
  },
  "revoswap": {
    xlayer: { factory: '0xa38498983e7b31DE851e36090bc9D1D8fB96BE5E', start: 1713225600, userFeesRatio: 1 },
  },
  "spartacus-exchange": {
    fantom: { factory: '0x535646cf57E4155Df723bb24625f356d98ae9D2F', start: 1650883041 },
  },
  "tetu": {
    polygon: { factory: '0x684d8c187be836171a1af8d533e4724893031828', start: 1634863038 },
  },
  "knightswap-finance": {
    bsc: { factory: '0xf0bc2E21a76513aa7CC2730C7A1D6deE0790751f', start: '2021-10-28' },
    fantom: { factory: '0x7d82F56ea0820A9d42b01C3C28F1997721732218', start: '2021-11-25' },
  },
  "radioshack": {
    polygon: { factory: '0xB581D0A3b7Ea5cDc029260e989f768Ae167Ef39B' },
    bsc: { factory: '0x98957ab49b8bc9f7ddbCfD8BcC83728085ecb238' },
    avax: { factory: '0xa0fbfda09b8815dd42ddc70e4f9fe794257cd9b6' },
  },
  "shimmersea": {
    shimmer_evm: { factory: '0x4fb5d3a06f5de2e88ce490e2e11d22b840d5ac47', start: '2023-10-04' },
  },
  "whaleswap": {
    bsc: { factory: '0xabc26f8364cc0dd728ac5c23fa40886fda3dd121', start: '2021-10-28' },
    fantom: { factory: '0xabc26f8364cc0dd728ac5c23fa40886fda3dd121', start: '2021-11-25' },
  },
  "reservoir-tools-amm": {
    abstract: { factory: '0x566d7510dEE58360a64C9827257cF6D0Dc43985E', start: '2025-01-07', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    ink: { factory: '0xfe57A6BA1951F69aE2Ed4abe23e0f095DF500C04', start: '2025-01-07', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    zero: { factory: '0x1B4427e212475B12e62f0f142b8AfEf3BC18B559', start: '2025-01-07', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
  "hyperjump": {
    bsc: { factory: '0xac653ce27e04c6ac565fd87f18128ad33ca03ba2', start: '2020-11-10' },
    fantom: { factory: '0x991152411A7B5A14A8CF0cDDE8439435328070dF', start: '2021-04-19' },
    metis: { factory: '0xAA1504c878B158906B78A471fD6bDbf328688aeB', start: '2022-05-04' },
  },
}

const optionsMap: Record<string, any> = {
  // replaced with pullHourly
  // "dyorswap": { runAsV1: true },
}

const methodologyMap: Record<string, any> = {
  "icecreamswap": {
    UserFees: "Users pays 0.3% of each swap",
    Fees: "A 0.3% trading fee is collected",
    Revenue: "A 1/6 fees goes to the protocol",
    SupplySideRevenue: "5/6 of trading fees are distributed among liquidity providers.",
  },
  "zkSwap_Finance": {
    Fees: "A 0.2% trading fee is collected",
    UserFees: "Users pays 0.2% of each swap",
    Revenue: "A 0.067% fees goes to the protocol",
    ProtocolRevenue: "A 0.067% fees goes to the protocol",
    SupplySideRevenue: "A 0.133% is distributed proportionally to liquidity providers (ZFLP token holders)",
  },
  "babydogeswap": {
    Fees: "Fees collected from user trading fees",
    UserFees: "Users pays 0.3% of each swap. Different user fee discounts depending on Baby Doge wallet balance (up to 70% off). Calculation made with base 0.3%",
    Revenue: "Up to 0.1% of user fees are distributed to treasury",
    ProtocolRevenue: "Up to 0.1% of user fees are distributed to treasury",
    SupplySideRevenue: "A 0.2% user fees is distributed among LPs",
  },
  "nile-exchange-v1": {
    Fees: "User pays 0.05%, 0.30%, or 1% on each swap.",
    UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
    Revenue: "80% fees are collected as revenue.",
    ProtocolRevenue: "Revenue going to the protocol. 5% of collected fees. (is probably right because the distribution is dynamic.)",
    HoldersRevenue: "User fees are distributed among holders. 75% of collected fees. (is probably right because the distribution is dynamic.)",
    SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)",
  },
  "purps": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    SupplySideRevenue: '80% swap fees distributed to LPs.',
    Revenue: '20% swap fees collected by Purps.',
    ProtocolRevenue: '20% swap fees collected by Purps.',
  },
  "hunnyswap": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    SupplySideRevenue: '0.18% swap fees distributed to LPs.',
    Revenue: '0.12% swap fees goes to protocol and holders',
    ProtocolRevenue: '0.02% swap fees goes to treasury',
    HoldersRevenue: '0.1%  swap fees goes to LOVE and gXOXO token stakers',
  },
  "hybra-v2": {
    Volume: 'Total swap volume collected from factory 0x9c7397c9C5ecC400992843408D3A283fE9108009',
    Fees: 'Users paid 0.25% per swap for volatile pairs and 0.02% for stable pairs.',
    UserFees: 'Users paid 0.25% per swap for volatile pairs and 0.02% for stable pairs.',
    Revenue: '12% swap fees collected by protocol Treasury.',
    ProtocolRevenue: '12% swap fees collected by protocol Treasury.',
    SupplySideRevenue: '88% swap fees distributed to LPs.',
  },
  "superswap-v2": {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    SupplySideRevenue: "LPs receive 20% of swap fees.",
    ProtocolRevenue: "Treasury receives 80% of swap fees.",
    Revenue: "Treasury receives 80% of swap fees.",
  },
  "madness-finance": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "archly-finance": {
    Fees: "The trading fees are 0.05%, and can be adjusted from 0.01% up to 0.1%.",
    UserFees: "Currently users pay a trading fee of 0.05%.",
    HoldersRevenue: "veArc voters receive all protocol fees.",
    Revenue: "All trading fees are paid to veArc voters.",
    SupplySideRevenue: "LPs do not earn any revenue from trading fees, only Arc emission decided by veArc voters.",
    ProtocolRevenue: "Treasury does not earn any revenue from trading fees.",
  },
  "pandoraswap": {
    Fees: 'Users pay fees per swap.',
    UserFees: 'Users pay fees per swap.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "auraswap": {
    Fees: 'Users pay 03% per swap.',
    UserFees: 'Users pay 03% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "solarflare": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'Solarflare collects 20% swap fees for FLARE buy back.',
    ProtocolRevenue: 'No revenue for Solarflare protocol.',
    HoldersRevenue: 'Solarflare collects 20% swap fees for FLARE buy back.',
    SupplySideRevenue: 'Solarflare distributes 80% swap fees to LPs.',
  },
  "swappi": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'Swappi collects 32% swap fees for protocol treasury and PPI buy back.',
    ProtocolRevenue: 'Swappi collects 12% swap fees for protocol treasury.',
    HoldersRevenue: 'Swappi collects 20% swap fees for PPI buy back.',
    SupplySideRevenue: 'Swappi distributes 68% swap fees to LPs.',
  },
  "sushiswap-classic": {
    Fees: "SushiSwap charges a flat 0.3% fee",
    UserFees: "Users pay a 0.3% fee on each trade",
    Revenue: "A 0.05% of each trade goes to treasury",
    HoldersRevenue: "Share of swap fee goes to xSUSHI stakers.",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "Liquidity providers get 5/6 of all trades in their pools",
  },
  "camelot": {
    Fees: 'Trading fees charged on swaps. Camelot V2 is a Uniswap V2 fork with 0.3% swap fee.',
    UserFees: 'Users pay 0.3% fee on each swap.',
    Revenue: 'Portion of trading fees that goes to the protocol (17.5%) and xGRAIL holders (22.5%), totaling 40% of swap fees.',
    ProtocolRevenue: '17.5% of trading fees (5% operating expenses + 12.5% GRAIL buyback/burn).',
    HoldersRevenue: '22.5% of trading fees go to xGRAIL holders via Real Yield Staking.',
    SupplySideRevenue: '60% of trading fees go to liquidity providers.',
  },
  "apeswap": {
    UserFees: "Users pays 0.2% of each swap",
    Fees: "A 0.2% trading fee is collected",
    Revenue: "A 0.05% (bsc and ethereum) or 0.15% (polygon and telos) of the fees goes to treasury, 50% of that fee is used to buyback and burn BANANA, on Telos 25% of the collected fees goes to Telos",
    ProtocolRevenue: "A 0.05% (bsc and ethereum) or 0.15% (polygon) or 0.0375% (telos) of the fees goes to treasury",
    HoldersRevenue: "Of all DEX trading fees earned by ApeSwap, 50% are used to buy back and burn BANANA on a quarterly basis",
    SupplySideRevenue: "A 0.15% (bsc and ethereum) or 0.05% (polygon and telos) is distributed proportionally to all APE-LP token holders",
  },
  "jetswap": {
    Fees: 'Users pay 0.3% on BSC, 0.1% on Fantom, Polygon per swap.',
    UserFees: 'Users pay 0.3% on BSC, 0.1% on Fantom, Polygon per swap.',
    Revenue: 'Protocol collects 16% swap fees on BSC and 50% swap fees on Fantom, Polygon.',
    ProtocolRevenue: 'Protocol collects 16% swap fees on BSC and 50% swap fees on Fantom, Polygon.',
    SupplySideRevenue: '84% swap fees on BSC and 50% swap fees on Fantom, Polygon distributed to LPs.',
  },
  "spookyswap": {
    Fees: "SpookySwap charges a flat 0.2% fee",
    UserFees: "Users pay a 0.2% fee on each trade",
    Revenue: "A 0.03% of each trade goes to treasury",
    HoldersRevenue: "Share of swap fee goes to xBOO stakers.",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "Liquidity providers get 0.17% of all trades in their pools",
  },
  "elk": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "empiredex": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "swapr": {
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: '10% swap fees collected by Swapr protocol.',
    ProtocolRevenue: '10% swap fees collected by Swapr protocol.',
    SupplySideRevenue: '90% swap fees distributed to LPs.',
  },
  "swapsicle": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "dackieswap-v2": {
    Fees: "All fees comes from the user.",
    UserFees: "User pays 0.25% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.17% of each swap.",
    Revenue: "Treasury receives 0.08% of each swap.",
    ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  },
  "tethys-finance": {
    Fees: 'Users pay 0.2% per swap',
    UserFees: 'Users pay 0.2% per swap',
    SupplySideRevenue: '70% swap fees distributed to LPs.',
    Revenue: '30% of fees generated from swaps are converted to METIS and distributed to staked TETHYS tokens',
    ProtocolRevenue: 'Protocol collects no revenue',
    HoldersRevenue: '30% of fees generated from swaps are converted to METIS and distributed to staked TETHYS tokens',
  },
  "sphynx": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "sparkdex-v2": {
    Volume: 'Total swap volume',
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'All swap fees are distributed to LPs.',
  },
  "hyperswap-v2": {
    Fees: "Total swap fees paid by users.",
    Revenue: "8% protocol revenue share and 32% holders revenue share.",
    ProtocolRevenue: "8% of fees collected by the protocol.",
    SupplySideRevenue: "60% of fees distributed to LPs.",
    HoldersRevenue: "32% of fees used for buy-back and burn.",
    UserFees: "Total swap fees paid by users.",
  },
  "fenix-finance": {
    Fees: 'Users pay 0.1% per swap for volitile pools and 0.03% per swap for stable pools.',
    UserFees: 'Users pay 0.1% per swap.',
    Revenue: 'Protocol collects 10% swap fees.',
    ProtocolRevenue: 'Protocol collects 10% swap fees.',
    SupplySideRevenue: '90% swap fees distributes to LPs.',
  },
  "dystopia": {
    Fees: 'Users pay 0.2% per swap.',
    UserFees: 'Users pay 0.2% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "complus-network": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "gravis": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "zkswap": {
    Fees: "Total swap fees paided by users.",
    Revenue: "Revenue collected from 100% swap fees.",
    ProtocolRevenue: "Revenue for HyperSwap from 100% swap fees.",
    SupplySideRevenue: "No fees distributed to LPs.",
    UserFees: "Total swap fees paided by users.",
  },
  "titano-swych": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'All swap fees distributes to LPs.',
  },
  "zebra-v1": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'Zebra collects 25% revenue from swap fees.',
    ProtocolRevenue: 'Zebra collects 25% revenue from swap fees.',
    SupplySideRevenue: 'Zebra distributes 75% swap fees to LPs.',
  },
  "zipswap": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "autoshark": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "blue-planet": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "cometh": {
    Fees: 'Users pay 0.5% per swap for most of pairs, 0.01% for stable pairs.',
    UserFees: 'Users pay 0.5% per swap for most of pairs, 0.01% for stable pairs.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "crodex": {
    Fees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    UserFees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "dinosaur-eggs": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "gravity-finance": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "hakuswap": {
    Fees: 'Users pay 0.2% per swap.',
    UserFees: 'Users pay 0.2% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "huckleberry": {
    Fees: 'Users pay 0.3% fees per swap.',
    UserFees: 'Users pay 0.3% fees per swap.',
    Revenue: 'No protocol revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "ocelex-v1": {
    Fees: 'Users pay 0.18% per swap for most of pairs, 0.04% for stable pairs.',
    UserFees: 'Users pay 0.18% per swap for most of pairs, 0.04% for stable pairs.',
    Revenue: 'Protocol collects all swap fees.',
    ProtocolRevenue: 'Protocol collects all swap fees.',
    SupplySideRevenue: 'No swap fees are distributed to LPs.',
  },
  "oolongswap": {
    Fees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    UserFees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    Revenue: 'Oolongswap collects 1/6 swap fees for protocol treasury.',
    ProtocolRevenue: 'Oolongswap collects 1/6 swap fees for protocol treasury.',
    SupplySideRevenue: 'Oolongswap distributes 5/6 swap fees to LPs.',
  },
  "protofi": {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "alienfi": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "benswap": {
    Fees: 'Users pay 0.2% per swap.',
    UserFees: 'Users pay 0.2% per swap.',
    Revenue: 'Protocol collects 25% swap fees.',
    ProtocolRevenue: 'Protocol collects 25% swap fees.',
    SupplySideRevenue: '75% swap fees distributed to LPs.',
  },
  "subzero-zswap": {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "pandora": {
    Fees: 'Users pay 0.3% fees per swap.',
    UserFees: 'Users pay 0.3% fees per swap.',
    Revenue: 'No protocol revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  "reservoir-tools-amm": {
    Fees: 'Swap fees paid by users on each trade.',
    UserFees: 'User pays fees on each swap.',
    Revenue: 'Protocol has no revenue.',
    ProtocolRevenue: 'Protocol has no revenue.',
    SupplySideRevenue: 'All user fees are distributed among LPs.',
    HoldersRevenue: 'Holders have no revenue.',
  },
}

const deadFromMap: Record<string, string> = {
  "auragi": '2025-06-01',
  "fcon-dex": '2023-12-12',
}

// Fees-specific configs (same protocol name may have different config for fees vs dexs)
const feesConfigs: Record<string, Record<string, any>> = {
  "merchant-moe-dex": {
    mantle: { factory: '0x5bef015ca9424a7c07b68490616a4c1f094bedec', revenueRatio: 0.05 / 0.3 },
  },
  "hydrometer": {
    base: { factory: '0xF60caCf0A3daa5B6a79ca6594BEF38F85391AE0A', swapEvent: velodromeSwapEvent, voter: '0x0207F9fee1e4F787f7d9F07d07401199cBb27a3F', maxPairSize: 65 },
  },
  "keller": {
    scroll: { factory: '0xbc83f7dF70aE8A3e4192e1916d9D0F5C2ee86367', voter: '0x30f827DECe6F25c74F37d0dD45bC245d893266e6' },
  },
  "Viridian": {
    core: { factory: '0xb54a83cfEc6052E05BB2925097FAff0EC22893F3', voter: '0xbB7855fA0Ad297EC6e4aa1d4BE30f148447eD68c' },
  },
  "abcdefx": {
    fantom: { factory: '0x01f43d2a7f4554468f77e06757e707150e39130c' },
    kcc: { factory: '0x01f43d2a7f4554468f77e06757e707150e39130c' },
    kava: { factory: '0x01f43d2a7f4554468f77e06757e707150e39130c' },
  },
  "chronos": {
    arbitrum: { factory: '0xCe9240869391928253Ed9cc9Bcb8cb98CB5B0722' },
  },
  "equilibre-exchange": {
    kava: { factory: '0xA138FAFc30f6Ec6980aAd22656F2F11C38B56a95' },
  },
  'tomb-swap': {
    [CHAIN.FANTOM]: { factory: '0xE236f6890F1824fa0a7ffc39b1597A5A6077Cfe9' },
  },
  "pearlfi": {
    polygon: { factory: '0xEaF188cdd22fEEBCb345DCb529Aa18CA9FcB4FBd' },
  },
  "nuri-exchange-v1": {
    scroll: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57' },
  },
  "capx": {
    capx: { factory: '0x5C5A750681708599A77057Fe599c1a7942dcc086', fees: 0.01, revenueRatio: 0.9, protocolRevenueRatio: 0.9, allowReadPairs: true, start: 1763329513 },
  },
  "beamswap": {
    moonbeam: { factory: '0x985BcA32293A7A496300a48081947321177a86FD', userFeesRatio: 1, revenueRatio: 0.13 / 0.30, protocolRevenueRatio: 0.13 / 0.30 },
  },
  "fwx-dex": {
    avax: { factory: '0x2131Bdb0E0B451BC1C5A53F2cBC80B16D43634Fa', fees: 0.001, start: '2024-06-06' },
    base: { factory: '0x3512DA8F30D9AE6528e8e0787663C14Fe263Fbea', fees: 0.0025, start: '2024-09-04' },
  },
  "honeyswap": {
    polygon: { factory: '0x03daa61d8007443a6584e3d8f85105096543c19c', start: '2021-05-28' },
    xdai: { factory: '0xa818b4f111ccac7aa31d0bcc0806d64f2e0737d7', start: '2020-09-04' },
  },
  "shibaswap": {
    ethereum: { factory: '0x115934131916c8b277dd010ee02de363c09d037c', start: '2021-07-06' },
  },
  "biswap": {
    bsc: { factory: '0x858e3312ed3a876947ea49d572a7c42de08af7ee', fees: 0.002, start: '2021-05-24' },
  },
}

const feesMethodologyMap: Record<string, any> = {
  "abcdefx": {
    UserFees: "Users pay a Trading fee on each swap, including Flash Loans.",
    Fees: "Net Trading fees paid by all ABcDeFx users.",
    Revenue: "100% of the trading fee is collected by Protocol.",
    ProtocolRevenue: "100% of the trading fee is collected by Protocol Treasury.",
    HoldersRevenue: "100% of Trade Fees is used to buyback ELITE.",
    SupplySideRevenue: "0% of trading fees are distributed among liquidity providers.",
  },
  "capx": {
    UserFees: "Users pay 1% of each swap",
    Fees: "A 1% trading fee is collected on all swaps",
    Revenue: "90% of the fees (0.9% of volume) goes to protocol treasury",
    ProtocolRevenue: "0.9% of trading volume goes to protocol treasury at 0x87b8F64BE420353d927aBF149EA62B68d45e8CE8",
    SupplySideRevenue: "10% of the fees (0.1% of volume) is distributed to liquidity providers",
  },
}

// --- Subgraph-based adapter configs ---
// These use univ2Adapter2 (subgraph queries) instead of on-chain log parsing.
// Each entry maps a protocol name to its subgraph configuration.
interface SubgraphProtocolConfig {
  endpoints: { [chain: string]: string };
  factoriesName?: string;
  totalVolume?: string;
  totalFeesField?: string | null;
  feeConfig?: {
    totalFees?: number;
    protocolFees?: number;
    revenue?: number;
    userFees?: number;
    supplySideRevenue?: number;
    holdersRevenue?: number;
  };
  start?: string | number;
  perChainStart?: { [chain: string]: string | number };
  methodology?: any;
  deadFrom?: string;
}

const subgraphConfigs: Record<string, SubgraphProtocolConfig> = {
  "minerswap": {
    endpoints: {
      [CHAIN.ETHEREUM]: "https://subgraph.minerswap.fi/subgraphs/name/pancakeswap/exchange",
    },
    factoriesName: "pancakeFactories",
  },
  "mojitoswap": {
    endpoints: {
      [CHAIN.KCC]: "https://thegraph.kcc.network/subgraphs/name/mojito/swap",
    },
    start: 1634200191,
  },
  "neby-dex": {
    endpoints: {
      [CHAIN.SAPPHIRE]: "https://graph.api.neby.exchange/dex",
    },
    factoriesName: "factories",
  },
  "pyeswap": {
    endpoints: {
      [CHAIN.BSC]: sdk.graph.modifyEndpoint('56dMe6VDoxCisTvkgXw8an3aQbGR8oGhR292hSu6Rh3K'),
    },
    factoriesName: "pyeFactories",
    start: 1660893036,
  },
  "savmswap": {
    endpoints: {
      [CHAIN.SVM]: "https://subgraph.8gr.xyz/subgraphs/name/savmswap/savmswap",
    },
    start: 1711411200,
  },
  "sharkswap": {
    endpoints: {
      [CHAIN.SX]: "https://rollup-graph.sx.technology/subgraphs/name/sharkswap/exchange",
    },
    factoriesName: "factories",
    totalVolume: "volumeUSD",
  },
  "solidlydex": {
    endpoints: {
      [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('4GX8RE9TzEWormbkayeGj4NQmmhYE46izVVUvXv8WPDh'),
    },
    start: 1672444800,
  },
  "sonic-market-cpmm": {
    endpoints: {
      [CHAIN.SONIC]: "https://subgraph.satsuma-prod.com/f6a8c4889b7b/clober/cpmm-v2-subgraph-sonic-mainnet/api",
    },
  },
  "stellaswap-v3": {
    endpoints: {
      [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('85R1ZetugVABa7BiqKFqE2MewRuJ8b2SaLHffyTHDAht'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: 1672876800,
  },
  "step-exchange": {
    endpoints: {
      [CHAIN.STEP]: "https://graph.step.network/subgraphs/name/stepapp/stepex",
    },
    factoriesName: "stepExFactories",
  },
  "ubeswap": {
    endpoints: {
      [CHAIN.CELO]: sdk.graph.modifyEndpoint('JWDRLCwj4H945xEkbB6eocBSZcYnibqcJPJ8h9davFi'),
    },
    factoriesName: "ubeswapFactories",
    start: 1614574153,
  },
  "wanswap-dex": {
    endpoints: {
      [CHAIN.WAN]: "https://thegraph.one/subgraphs/name/wanswap/wanswap-subgraph-3",
    },
    start: 1632268798,
  },
  "yokaiswap": {
    endpoints: {
      [CHAIN.GODWOKEN]: "https://v0.yokaiswap.com/subgraphs/name/yokaiswap/exchange",
      [CHAIN.GODWOKEN_V1]: "https://www.yokaiswap.com/subgraphs/name/yokaiswap/exchange",
    },
    factoriesName: "yokaiFactories",
  },
  "zircon-gamma": {
    endpoints: {
      [CHAIN.MOONRIVER]: "https://api.thegraph.com/subgraphs/name/reshyresh/zircon-alpha",
    },
    start: 1663200000,
  },
  "aktionariat": {
    endpoints: {
      [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('2ZoJCp4S7YP7gbYN2ndsYNjPeZBV1PMti7BBoPRRscNq'),
      [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('3QfEXbPfP23o3AUzcmjTfRtUUd4bfrFj3cJ4jET57CTX'),
      [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('7camBLZckE5TLKha372tqawpDs8Lkez6yYiri7PykRak'),
    },
    factoriesName: "registries",
    totalVolume: "totalVolumeUSD",
  },
  "canary": {
    endpoints: {
      [CHAIN.AVAX]: sdk.graph.modifyEndpoint('An3x5Mz4YXEERomXYC4AhGgNhRthPFXNYDnrMCjrAJe'),
    },
    factoriesName: "canaryFactories",
  },
  "candyswap": {
    endpoints: {
      [CHAIN.MEER]: "https://subgraph.candyswap.exchange/subgraphs/name/exchange",
    },
    factoriesName: "pancakeFactories",
    start: 1662940800,
  },
  "cytoswap": {
    endpoints: {
      [CHAIN.HELA]: "https://subgraph.snapresearch.xyz/subgraphs/name/cytoswap-mainnet",
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: 1715299200,
  },
  "dfx-finance": {
    endpoints: {
      [CHAIN.ETHEREUM]: "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2/latest/gn",
      [CHAIN.POLYGON]: "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2-polygon/latest/gn",
    },
    factoriesName: "dfxfactoryV2S",
    totalVolume: "totalVolumeUSD",
    start: 1621418717,
  },
  "energiswap": {
    endpoints: {
      [CHAIN.ENERGI]: "https://graph.energi.network/http/subgraphs/name/energi/energiswap",
    },
    factoriesName: "energiswapFactories",
    totalVolume: "totalVolumeUSD",
  },
  "fathom-dex": {
    endpoints: {
      [CHAIN.XDC]: "https://xinfin-graph.fathom.fi/subgraphs/name/dex-subgraph",
    },
    factoriesName: "fathomSwapFactories",
    start: 1682640000,
  },
  "fwx-dex": {
    endpoints: {
      [CHAIN.AVAX]: "https://subgraphs.fwx.finance/avac/subgraphs/name/fwx-exchange-avac",
      [CHAIN.BASE]: "https://subgraphs.fwx.finance/base/subgraphs/name/fwx-exchange-base-prod",
    },
    factoriesName: "pancakeDayDatas",
    start: 1717632000,
  },
  "fx-swap": {
    endpoints: {
      [CHAIN.FUNCTIONX]: "https://graph-node.functionx.io/subgraphs/name/subgraphFX2",
    },
    factoriesName: "fxswapFactories",
  },
  "glide-finance": {
    endpoints: {
      [CHAIN.ELASTOS]: "https://api.glidefinance.io/subgraphs/name/glide/exchange",
    },
    factoriesName: "glideFactories",
    start: 1635479215,
  },
  "hercules": {
    endpoints: {
      [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/amm-subgraph-andromeda/",
    },
    start: 1710115200,
  },
  "hiveswap-v3": {
    endpoints: {
      [CHAIN.MAP]: "https://graph.mapprotocol.io/subgraphs/name/hiveswap/exchange-v3",
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: 1706585489,
  },
  "hiveswap": {
    endpoints: {
      [CHAIN.MAP]: "https://makalu-graph.maplabs.io/subgraphs/name/map/hiveswap2",
    },
    start: 1657929600,
  },
  "levinswap": {
    endpoints: {
      [CHAIN.XDAI]: sdk.graph.modifyEndpoint('2gNP6y1kTvg6aAhus8DU8DyGS1cn5TvGD3S6VjjXCZZC'),
    },
    start: 1610767793,
  },
  "lif3-swap": {
    endpoints: {
      [CHAIN.TOMBCHAIN]: "https://graph-node.lif3.com/subgraphs/name/lifeswap",
    },
  },
  "katana": {
    endpoints: {
      [CHAIN.RONIN]: "https://defillama.axiedao.org/graphql/katana",
    },
    factoriesName: "katanaFactories",
    totalVolume: "totalVolumeUSD",
    feeConfig: {
      totalFees: 0.003,
      protocolFees: 0.0005,
      supplySideRevenue: 0.0025,
      revenue: 0.0005,
      userFees: 0.003,
    },
    start: '2021-11-01',
  },
  "defi-swap": {
    endpoints: {
      [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('G7W3G1JGcFbWseucNkHHvQorxyjQLEQt7vt9yPN97hri'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    feeConfig: {
      totalFees: 0.003,
    },
    start: '2021-09-21',
  },
  "pulsex-v2": {
    endpoints: {
      [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsexv2",
    },
    factoriesName: "pulseXFactories",
    feeConfig: {
      totalFees: 0.0029,
      protocolFees: 0.0007 * 0.1439,
      supplySideRevenue: 0.0022,
      holdersRevenue: 0.0007 * 0.8561,
      revenue: 0.0007,
      userFees: 0.0029,
    },
    start: '2023-05-25',
  },
  "pulsex-v1": {
    endpoints: {
      [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex",
    },
    factoriesName: "pulseXFactories",
    totalVolume: "totalVolumeUSD",
    feeConfig: {
      totalFees: 0.0029,
      protocolFees: 0.0029 * 0.1439,
      supplySideRevenue: 0,
      holdersRevenue: 0.0029 * 0.8561,
      revenue: 0.0029,
      userFees: 0.0029,
    },
    start: '2023-05-13',
  },
  "pulsex-stableswap": {
    endpoints: {
      [CHAIN.PULSECHAIN]: "https://graph.pulsechain.com/subgraphs/name/pulsechain/stableswap",
    },
    factoriesName: "pulseXFactories",
    totalVolume: "totalVolumeUSD",
    feeConfig: {
      totalFees: 0.0004,
      protocolFees: 0.0002 * 0.1439,
      supplySideRevenue: 0.0002,
      holdersRevenue: 0.0002 * 0.8561,
      revenue: 0.0002,
      userFees: 0.0004,
    },
    start: '2024-09-13',
  },
  "snap-v3": {
    endpoints: {
      [CHAIN.TAC]: "https://api.goldsky.com/api/public/project_cltyhthusbmxp01s95k9l8a1u/subgraphs/cl-analytics-tac/v1.0.1/gn",
    },
    factoriesName: "factories",
    totalFeesField: "totalFeesUSD",
  },
  "cypher-v2": {
    endpoints: {
      [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('BTCmD66QoqG2f3pirgYmKWgc2LWgw4F4bEavsupxkS2h'),
    },
    totalVolume: "totalVolumeUSD",
    totalFeesField: "totalFeeUSD",
    start: '2025-11-22',
  },
  "cypher-v4": {
    endpoints: {
      [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('8knsFRJjoEtsRECVSdxhfbvidipCMdBjXx1hQmMRujHx'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    totalFeesField: "totalFeesUSD",
    start: '2025-11-22',
  },
  "kura-v2": {
    endpoints: {
      [CHAIN.SEI]: "https://api.goldsky.com/api/public/project_cm9ghm7cnxuaa01x5g6pfchp7/subgraphs/sei/2/gn",
    },
    factoriesName: "legacyFactories",
    totalFeesField: "totalFeeUSD",
  },
  "ramses-exchange-v2": {
    endpoints: {
      [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ATQTt3wRTgXy4canCh6t1yeczAz4ZuEkFQL2mrLXEMyQ'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: '2023-05-31',
  },
  "thena-integral": {
    endpoints: {
      [CHAIN.BSC]: sdk.graph.modifyEndpoint('BoHp9H2rGzVFPiqc56PJ1Gw7EPDaiHMcupsUuksMGp2K'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: '2024-11-18',
  },
  "thena-v3": {
    endpoints: {
      [CHAIN.BSC]: sdk.graph.modifyEndpoint('Hnjf3ipVMCkQze3jmHp8tpSMgPmtPnXBR38iM4ix1cLt'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: '2023-04-13',
  },
  "thena": {
    endpoints: {
      [CHAIN.BSC]: sdk.graph.modifyEndpoint('FKEt2N5VmSdEYcz7fYLPvvnyEUkReQ7rvmXzs6tiKCz1'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: '2023-01-04',
  },
  "vvs-finance": {
    endpoints: {
      [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/vvs/exchange",
    },
    factoriesName: "vvsFactories",
    totalVolume: "totalVolumeUSD",
    start: '2021-09-19',
  },
  "h2-finance-v3": {
    endpoints: {
      [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/h2-exchange-v3-cronos-zkevm/latest/gn",
    },
    factoriesName: "factories",
    start: '2024-08-14',
  },
  "h2-finance": {
    endpoints: {
      [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/h2-exchange-v2-cronos-zkevm/latest/gn",
    },
    factoriesName: "vvsFactories",
    totalVolume: "totalVolumeUSD",
    start: '2024-08-14',
  },
  "hercules-v3": {
    endpoints: {
      [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics",
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: '2023-11-03',
  },
  "pangolin": {
    endpoints: {
      avax: sdk.graph.modifyEndpoint('CPXTDcwh6tVP88QvFWW7pdvZJsCN4hSnfMmYeF1sxCLq'),
    },
    factoriesName: "pangolinFactories",
    totalVolume: "totalVolumeUSD",
    start: '2022-01-21',
  },
  "pharaoh-exchange": {
    endpoints: {
      [CHAIN.AVAX]: sdk.graph.modifyEndpoint('NFHumrUD9wtBRnZnrvkQksZzKpic26uMM5RbZR56Gns'),
    },
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    start: '2023-12-12',
  },
}

// Build subgraph-based adapters into SimpleAdapter format
function buildSubgraphAdapter(config: SubgraphProtocolConfig): SimpleAdapter {
  const chains = Object.keys(config.endpoints)
  const fetch = univ2Adapter2({
    endpoints: config.endpoints,
    factoriesName: config.factoriesName,
    totalVolume: config.totalVolume,
    totalFeesField: config.totalFeesField ?? undefined as any,
    feeConfig: config.feeConfig,
  })

  const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains,
  }

  if (config.start) (adapter as any).start = config.start
  if (config.methodology) (adapter as any).methodology = config.methodology
  if (config.deadFrom) (adapter as any).deadFrom = config.deadFrom

  return adapter
}

// Build dex protocols
const protocols: Record<string, any> = {}
for (const [name, config] of Object.entries(configs)) {
  const adapter = uniV2Exports(config, optionsMap[name])
  if (methodologyMap[name]) adapter.methodology = methodologyMap[name]
  if (deadFromMap[name]) adapter.deadFrom = deadFromMap[name]
  protocols[name] = adapter
}

// Build subgraph dex protocols
for (const [name, config] of Object.entries(subgraphConfigs)) {
  protocols[name] = buildSubgraphAdapter(config)
}

// Build fees protocols
const feesProtocols: Record<string, any> = {}
for (const [name, config] of Object.entries(feesConfigs)) {
  const adapter = uniV2Exports(config)
  if (feesMethodologyMap[name]) adapter.methodology = feesMethodologyMap[name]
  feesProtocols[name] = adapter
}

export const { protocolList, getAdapter } = createFactoryExports(protocols)
export const fees = createFactoryExports(feesProtocols)
