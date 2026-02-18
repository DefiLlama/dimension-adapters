import { uniV2Exports } from "../helpers/uniswap";
import { createFactoryExports } from "./registry";

const velodromeSwapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'

const configs: Record<string, Record<string, any>> = {
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
}

const optionsMap: Record<string, any> = {
  // replaced with pullHourly
  // "dyorswap": { runAsV1: true },
  // "canto-dex": { runAsV1: true },
  // "viperswap": { runAsV1: true },
  // "swapmode-v2": { runAsV1: true },
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
  "pearlfi": {
    polygon: { factory: '0xEaF188cdd22fEEBCb345DCb529Aa18CA9FcB4FBd' },
  },
  "nuri-exchange-v1": {
    scroll: { factory: '0xAAA16c016BF556fcD620328f0759252E29b1AB57' },
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
}

// Build dex protocols
const protocols: Record<string, any> = {}
for (const [name, config] of Object.entries(configs)) {
  const adapter = uniV2Exports(config, optionsMap[name])
  if (methodologyMap[name]) adapter.methodology = methodologyMap[name]
  if (deadFromMap[name]) adapter.deadFrom = deadFromMap[name]
  protocols[name] = adapter
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
