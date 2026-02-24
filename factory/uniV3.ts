import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";
import { createFactoryExports } from "./registry";

const algebraV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'
const algebraV3PoolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const protocolFeesSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
const algebraV2SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'

const configs: Record<string, Record<string, any>> = {
  "mintswap": {
    mint: { factory: '0x1f88BB455E02646224A0a65f3eb4B2FCb4fb8e49' },
  },
  "icecreamswap-v3": {
    core: { factory: '0xa8a3AAD4f592b7f30d6514ee9A863A4cEFF6531D' },
  },
  "monday-trade-spot": {
    monad: { factory: '0xc1e98d0a2a58fb8abd10ccc30a58efff4080aa21', start: "2025-11-13" },
  },
  "capricorn": {
    monad: { factory: '0x6B5F564339DbAd6b780249827f2198a841FEB7F3' },
  },
  "pinot-v3": {
    monad: { factory: '0x7716F310d62Aee3d009fd94067c627fe7E2f2aA9' },
  },
  "kura-v3": {
    sei: { factory: '0xd0c54c480fD00DDa4DF1BbE041A6881f2F09111e' },
  },
  "equalizer-cl": {
    sonic: { factory: '0x7Ca1dCCFB4f49564b8f13E18a67747fd428F1C40' },
  },
  "ginsengswap": {
    conflux: { factory: '0x62aa0294cb42aae39b7772313eadfa5d489146ec' },
  },
  "hardswap": {
    kava: { factory: '0xD6E4170C9097A5B5C85E8A39111bF37E47C90076' },
  },
  "keller-cl": {
    scroll: { factory: '0x952aC46B2586737df679e836d9B980E43E12B2d8' },
  },
  "kittypunch-v3": {
    flow: { factory: '0xf331959366032a634c7cAcF5852fE01ffdB84Af0' },
  },
  "linehub-v3": {
    linea: { factory: '0x6c379d538f2f7cb642851e154a8e572d63238df4' },
  },
  "nile-exchange": {
    linea: { factory: '0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42' },
  },
  "nuri-exchange-v2": {
    scroll: { factory: '0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42' },
  },
  "sonex": {
    soneium: { factory: '0x3E4ff8662820E3dec3DACDb66ef1FFad5Dc5Ab83' },
  },
  "voltage-v4": {
    fuse: { factory: '0xccEdb990abBf0606Cf47e7C6A26e419931c7dc1F', poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV3SwapEvent, isAlgebraV3: true },
  },
  "DerpDEX": {
    era: { factory: '0x52a1865eb6903bc777a02ae93159105015ca1517' },
    base: { factory: '0xeddef4273518b137cdbcb3a7fa1c6a688303dfe2' },
  },
  "agni-fi": {
    mantle: { factory: '0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035', swapEvent: protocolFeesSwapEvent },
  },
  "assetchain-swap": {
    assetchain: { factory: '0xa9d53862D01190e78dDAf924a8F497b4F8bb5163' },
  },
  "chronos-v2": {
    arbitrum: { factory: '0x4Db9D624F67E00dbF8ef7AE0e0e8eE54aF1dee49' },
  },
  "crescent-swap": {
    arbitrum: { factory: '0x8219904A8683d06e38605276baCBf2D29aa764DD' },
  },
  "goblin-dex": {
    smartbch: { factory: '0x08153648C209644a68ED4DC0aC06795F6563D17b' },
    bsc: { factory: '0x30D9e1f894FBc7d2227Dd2a017F955d5586b1e14' },
    base: { factory: '0xE82Fa4d4Ff25bad8B07c4d1ebd50e83180DD5eB8' },
  },
  "holdstation-swap": {
    era: { factory: '0x1153D1d27A558471eF051c5D2D075d7D07B84A07' },
    berachain: { factory: '0xCaca5910586473646F294d8FA5530cA9E8E3fc38' },
  },
  "monocerus": {
    avax: { factory: '0x8d312c2B300239B84c304B5af5A3D00cBF0803F6' },
    manta: { factory: '0x481F4b658d1447A9559B220640Fb79C2B993032A' },
  },
  "pearl-v2": {
    real: { factory: '0xeF0b0a33815146b599A8D4d3215B18447F2A8101' },
  },
  "throne-v3": {
    base: { factory: '0xe8839bf8175812691c6578c0fc80e721bc3e00fb' },
  },
  "unchain-x": {
    bsc: { factory: '0x82fA7b2Ce2A76C7888A9D3B0a81E0b2ecfd8d40c' },
  },
  "voltage-v3": {
    fuse: { factory: '0xaD079548b3501C5F218c638A02aB18187F62b207' },
  },
  "warpgate": {
    imx: { factory: '0x464Ea59a3AA5Ea35e961Ff8aA4CCC7183eAA197e' },
  },
  "alienbase-v3": {
    base: { factory: '0x0Fd83557b2be93617c9C1C1B6fd549401C74558C' },
  },
  "apertureSwap": {
    manta: { factory: '0x5bd1F6735B80e58aAC88B8A94836854d3068a13a' },
  },
  "arthswap-v3": {
    astar: { factory: '0x69E92b56e4BF4C0FFa2cFB087c7EA47E846a7244' },
  },
  "blasterswap-v3": {
    blast: { factory: '0x1A8027625C830aAC43aD82a3f7cD6D5fdCE89d78' },
  },
  "dtx-v3": {
    taiko: { factory: '0xfCA1AEf282A99390B62Ca8416a68F5747716260c' },
  },
  "kim-exchange-v3": {
    mode: { factory: '0xB5F00c2C5f8821155D8ed27E31932CFD9DB3C5D5', poolCreatedEvent: 'event Pool(address indexed token0,address indexed token1,address pool)' },
  },
  "moraswap-v3": {
    neon_evm: { factory: '0x58122246F7e33669cde3486Dd72f95c2e886E375' },
  },
  "scribe-exchange-v4": {
    scroll: { factory: '0xDc62aCDF75cc7EA4D93C69B2866d9642E79d5e2e', poolCreatedEvent: 'event Pool(address indexed token0,address indexed token1,address pool)' },
  },
  "thruster-v3": {
    blast: { factory: '0x71b08f13B3c3aF35aAdEb3949AFEb1ded1016127' },
  },
  "vanillaswap-v3": {
    defichain_evm: { factory: '0x9C444DD15Fb0Ac0bA8E9fbB9dA7b9015F43b4Dc1' },
  },
  "xtrade": {
    xlayer: { factory: '0x612D9EA08be59479B112D8d400C7F0A2E4aD4172', poolCreatedEvent: 'event Pool(address indexed token0,address indexed token1,address pool)' },
  },
  "SwapX-algebra": {
    sonic: { factory: '0x8121a3F8c4176E9765deEa0B95FA2BDfD3016794', start: "2024-12-24", isAlgebraV3: true },
  },
  "aethonswap": {
    monad: { factory: '0x05aA1d36F78D1242C40b3680d38EB1feE7060c20', poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV3SwapEvent, isAlgebraV3: true },
  },
  // with fee ratios / options / methodology
  "squadswap-v3": {
    bsc: { factory: '0x009c4ef7C0e0Dd6bd1ea28417c01Ea16341367c3', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "9mm": {
    pulse: { factory: '0xe50dbdc88e87a2c92984d794bcf3d1d76f619c68' },
    base: { factory: '0x7b72C4002EA7c276dd717B96b20f4956c5C904E7' },
    sonic: { factory: '0x924aee3929C8A45aC9c41e9e9Cdf3eA761ca75e5' },
  },
  "maia-v3": {
    metis: { factory: '0xf5fd18Cd5325904cC7141cB9Daca1F2F964B9927', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1, holdersRevenueRatio: 0, start: "2023-04-01" },
  },
  "hypertrade-v3": {
    hyperliquid: { factory: '0x1Cd8363DfAdA19911f745BA984fce02b42c943bF', userFeesRatio: 1, revenueRatio: 0.143, protocolRevenueRatio: 0.143 },
  },
  "fluxion-network": {
    mantle: { factory: '0xF883162Ed9c7E8EF604214c964c678E40c9B737C', start: '2025-11-17', userFeesRatio: 1, revenueRatio: 0 },
  },
  "octoswap-cl": {
    monad: { factory: '0x30Db57A29ACf3641dfc3885AF2e5f1F5A408D9CB', revenueRatio: 1 / 5, protocolRevenueRatio: 1 / 5 },
  },
  "prjx": {
    hyperliquid: { factory: '0xff7b3e8c00e57ea31477c32a5b52a58eea47b072', revenueRatio: 0.143, protocolRevenueRatio: 0.143 },
  },
  "flowswap-v3": {
    flow: { factory: '0xca6d7Bb03334bBf135902e1d919a5feccb461632', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
  "lynex": {
    linea: { factory: '0x622b2c98123D303ae067DB4925CD6282B3A08D0F', isAlgebraV2: true, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent },
  },
  "squadswap-wow": {
    bsc: { factory: '0x10d8612D9D8269e322AB551C18a307cB4D6BC07B', userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1, swapEvent: protocolFeesSwapEvent },
  },
  "datadex": {
    vana: { factory: '0xc2a0d530e57B1275fbce908031DA636f95EA1E38', revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "shibaswap-v2": {
    ethereum: { factory: '0xD9CE49caf7299DaF18ffFcB2b84a44fD33412509', start: "10-24-2024", userFeesRatio: 1, revenueRatio: 0 },
    shibarium: { factory: '0x2996B636663ddeBaE28742368ed47b57539C9600', start: "10-24-2024", userFeesRatio: 1, revenueRatio: 0 },
  },
  "swapmode-v3": {
    mode: { factory: '0x6E36FC34eA123044F278d3a9F3819027B21c9c32', start: '2024-03-13', userFeesRatio: 1, revenueRatio: 0.64, protocolRevenueRatio: 0.64 },
  },
  "ultrasolid-v3": {
    hyperliquid: { factory: '0xD883a0B7889475d362CEA8fDf588266a3da554A1', swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)', poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)', start: '2025-08-10', revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0, userFeesRatio: 1 },
  },
  "xswap-v3": {
    xdc: { factory: '0x30F317A9EC0f0D06d5de0f8D248Ec3506b7E4a8A', userFeesRatio: 1, revenueRatio: 0 },
  },
  "summitx-fi": {
    camp: { factory: '0xBa08235b05d06A8A27822faCF3BaBeF4f972BF7d', start: '2025-08-23', revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
  "thick": {
    fantom: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    arbitrum: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    base: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    sonic: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
  },
  "beamswap-v3": {
    moonbeam: { factory: '0xd118fa707147c54387b738f54838ea5dd4196e71', start: '2023-05-18', revenueRatio: 0.16, holdersRevenueRatio: 0, protocolRevenueRatio: 0.16 },
  },
  "2thick": {
    fantom: { factory: '0x7Ca1dCCFB4f49564b8f13E18a67747fd428F1C40' },
    base: { factory: '0x7Ca1dCCFB4f49564b8f13E18a67747fd428F1C40' },
    sonic: { factory: '0x7Ca1dCCFB4f49564b8f13E18a67747fd428F1C40' },
  },
  "doveswap": {
    polygon_zkevm: { factory: '0xde474db1fa59898bc91314328d29507acd0d593c', revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
  },
  "supswap-v3": {
    mode: { factory: '0xa0b018Fe0d00ed075fb9b0eEe26d25cf72e1F693', revenueRatio: 1 / 3, protocolRevenueRatio: 1 / 3, swapEvent: protocolFeesSwapEvent },
  },
  "moai-v3": {
    xrplevm: { factory: '0x678100B9095848FCD4AE6C79A7D29c11815D07fe', revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
  "prism-dex": {
    [CHAIN.MEGAETH]: { factory: '0x1adb8f973373505bb206e0e5d87af8fb1f5514ef', userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25, start: '2026-02-09' },
  },
  "parity-dex-cl": {
    [CHAIN.MONAD]: { factory: '0x2A6CE23C5017aF1b07B9c4E4014442aDE18Bd404', start: '2026-02-11' },
  },
  "swyrl-cl": {
    monad: { factory: '0x02a898F85a6984213Ac6d2577ff3406394172abf' },
  },
  "satsuma": {
    citrea: { factory: '0x10253594A832f967994b44f33411940533302ACb', isAlgebraV3: true, start: "2026-01-17" },
  },
  "currentx-v3": {
    megaeth: { factory: '0x09cF8A0b9e8C89bff6d1ACbe1467e8E335Bdd03E', start: "2026-02-05", userFeesRatio: 0.75, revenueRatio: 0.25 },
  },
  "juiceswap": {
    citrea: { factory: '0xd809b1285aDd8eeaF1B1566Bf31B2B4C4Bba8e82', start: "2026-01-29", userFeesRatio: 1, revenueRatio: 0 },
  },
  "koi-finance-cl": {
    era: { factory: '0x488A92576DA475f7429BC9dec9247045156144D3', start: 1679529600, userFeesRatio: 1 },
  },
  "zebra-v2": {
    scroll: { factory: '0x96a7F53f7636c93735bf85dE416A4Ace94B56Bd9', userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
  },
  "hybra-v3": {
    hyperliquid: { factory: '0x2dC0Ec0F0db8bAF250eCccF268D7dFbF59346E5E', userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 },
  },
  "superswap-v3": {
    optimism: { factory: '0xe52a36Bb76e8f40e1117db5Ff14Bd1f7b058B720', userFeesRatio: 1, revenueRatio: 0.8, protocolRevenueRatio: 0.8 },
  },
  "archfi": {
    btnx: { factory: '0x57Fd247Ce7922067710452923806F52F4b1c2D34', isAlgebraV3: true, start: "2025-06-29", userFeesRatio: 1, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent },
  },
  "echodex-v3": {
    linea: { factory: '0x559Fa53Be355835a038aC303A750E8788668636B', swapEvent: protocolFeesSwapEvent },
  },
  "butterxyz": {
    mantle: { factory: '0xEECa0a86431A7B42ca2Ee5F479832c3D4a4c2644', start: '2023-12-12' },
  },
  "firefly": {
    manta: { factory: '0x8666EF9DC0cA5336147f1B11f2C4fC2ecA809B95', start: '2024-04-01' },
  },
  "horiza": {
    arbitrum: { factory: '0x5b1C257B88537d1Ce2AF55a1760336288CcD28B6', start: '2024-01-07' },
  },
  "sparkdex-v3": {
    flare: { factory: '0xb3fB4f96175f6f9D716c17744e5A6d4BA9da8176', userFeesRatio: 1, revenueRatio: 0.075, protocolRevenueRatio: 0.025, holdersRevenueRatio: 0.05 },
  },
  "reservoir-tools-clmm": {
    abstract: { factory: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1', start: '2025-01-07', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    ink: { factory: '0x640887A9ba3A9C53Ed27D0F7e8246A4F933f3424', start: '2025-01-07', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    zero_network: { factory: '0xA1160e73B63F322ae88cC2d8E700833e71D0b2a1', start: '2025-12-21', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
  "enosys": {
    flare: { factory: '0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de', start: "2025-03-03", userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
    songbird: { factory: '0x416F1CcBc55033Ae0133DA96F9096Fe8c2c17E7d', start: "2024-09-24", userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "gliquid": {
    hyperliquid: { factory: '0x10253594A832f967994b44f33411940533302ACb', isAlgebraV3: true, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV3SwapEvent, userFeesRatio: 1, revenueRatio: 0.13, protocolRevenueRatio: 0.1, holdersRevenueRatio: 0 },
  },
  "hx-finance": {
    hyperliquid: { factory: '0x41ba59415eC75AC4242dd157F2a7A282F1e75652', isAlgebraV3: true, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent, userFeesRatio: 1, revenueRatio: 0.13, protocolRevenueRatio: 0.13 },
  },
  "swapsicle-v2": {
    mantle: { factory: '0xC848bc597903B4200b9427a3d7F61e3FF0553913', isAlgebraV3: true, start: 1697155200, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent, userFeesRatio: 1, revenueRatio: 0.455, protocolRevenueRatio: 0.13, holdersRevenueRatio: 0.325 },
    telos: { factory: '0xA09BAbf9A48003ae9b9333966a8Bda94d820D0d9', isAlgebraV3: true, start: 1698105600, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent, userFeesRatio: 1, revenueRatio: 0.455, protocolRevenueRatio: 0.13, holdersRevenueRatio: 0.325 },
    taiko: { factory: '0xBa90FC740a95A6997306255853959Bb284cb748a', isAlgebraV3: true, start: 1724943360, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent, userFeesRatio: 1, revenueRatio: 0.455, protocolRevenueRatio: 0.13, holdersRevenueRatio: 0.325 },
  },
  "fenix-finance-v3": {
    blast: { factory: '0x7a44CD060afC1B6F4c80A2B9b37f4473E74E25Df', isAlgebraV3: true, poolCreatedEvent: algebraV3PoolCreatedEvent, swapEvent: algebraV2SwapEvent, userFeesRatio: 1, revenueRatio: 0.1, protocolRevenueRatio: 0.1 },
  },
  "wagmi": {
    fantom: { factory: '0xaf20f5f19698f1D19351028cd7103B63D30DE7d7', start: "2023-04-12", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 },
    ethereum: { factory: '0xB9a14EE1cd3417f3AcC988F61650895151abde24', start: "2023-09-30", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 },
    metis: { factory: '0x8112E18a34b63964388a3B2984037d6a2EFE5B8A', start: "2023-12-18", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 },
    kava: { factory: '0x0e0Ce4D450c705F8a0B6Dd9d5123e3df2787D16B', start: "2023-09-12", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 },
    sonic: { factory: '0x56CFC796bC88C9c7e1b38C2b0aF9B7120B079aef', start: "2024-12-11", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 },
    base: { factory: '0x576A1301B42942537d38FB147895fE83fB418fD4', start: "2024-05-10", userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 },
  },
  "spookyswap-v3": {
    fantom: { factory: '0x7928a2c48754501f3a8064765ECaE541daE5c3E6', start: '2023-11-22', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    sonic: { factory: '0x3D91B700252e0E3eE7805d12e048a988Ab69C8ad', start: '2024-12-12', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
  "omni-exchange-v3": {
    base: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
    arbitrum: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
    bsc: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
    avax: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
    optimism: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
    sonic: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
    plasma: { factory: '0xd6Ab0566e7E60B67c50AC73ddFf4e3DdcB829EC2', swapEvent: protocolFeesSwapEvent, userFeesRatio: 1, revenueRatio: 0.32, protocolRevenueRatio: 0.32, holdersRevenueRatio: 0 },
  },
  "syncswap-v3": {
    era: { factory: '0x9d63d318143cf14ff05f8aaa7491904a494e6f13', isAlgebraV3: true, start: '2023-03-23', poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    linea: { factory: '0xc5916f6cf441c72daa2e2c48afc7ce642eee6690', isAlgebraV3: true, start: '2023-07-19', poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
    sophon: { factory: '0x0f6e27007e257e74c86522387bd071d561ba3c97', isAlgebraV3: true, start: '2024-12-16', poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)', userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0 },
  },
}

const optionsMap: Record<string, any> = {
  "9mm": { swapEvent: protocolFeesSwapEvent, },
}

const methodologyMap: Record<string, any> = {
  "prism-dex": {
    Volume: "Swap volume from all Prism DEX V3 pools deployed via the Prism DEX V3 factory.",
    Fees: "Users pay each pool's configured V3 fee tier on every swap.",
    UserFees: "Equals total swap fees paid by users.",
    Revenue: "When protocol fees are enabled on a pool, 25% of swap fees are counted as protocol revenue.",
    ProtocolRevenue: "When protocol fees are enabled on a pool, 25% of swap fees are counted as protocol revenue.",
    SupplySideRevenue: "When protocol fees are enabled on a pool, 75% of swap fees are distributed to LPs.",
  },
  "maia-v3": {
    UserFees: "User pays 0.01%, 0.05%, 0.30%, or 1% on each swap.",
    ProtocolRevenue: "Protocol receives 10% of fees.",
    SupplySideRevenue: "90% of user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue.",
  },
  "hypertrade-v3": {
    Fees: "Users pay trade fees on each swap.",
    UserFees: "Users pay trade fees on each swap.",
    Revenue: "Protocol receives 14.3% of trade fees.",
    ProtocolRevenue: "Protocol receives 14.3% of trade fees.",
    SupplySideRevenue: "Liquidity providers get 85.7% of trade fees.",
  },
  "fluxion-network": {
    Fees: 'Users pay fees on every swap.',
    UserFees: 'Users pay fees on every swap.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'All swap fees are distributed to LPs.',
  },
  "datadex": {
    Fees: "Swap fees collected from users on each trade.",
    Revenue: "Configurable portion of the swap fees collected from users.",
    ProtocolRevenue: "When set, the protocol receives a portion of trade fees.",
  },
  "thick": {
    UserFees: "Users pay trade fees on each swap.",
    ProtocolRevenue: "Protocol receives some % of trade fees.",
    SupplySideRevenue: "User fees minus Protocol fees.",
    HoldersRevenue: "ELITE Holders benefit from Protocol Revenue.",
  },
  "beamswap-v3": {
    UserFees: "User pays 0.01%, 0.05%, 0.3%, or 1% on each swap.",
    ProtocolRevenue: "Protocol receives 16% of fees.",
    SupplySideRevenue: "84% of user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue.",
  },
  "2thick": {
    UserFees: "Users pay trade fees on each swap.",
    ProtocolRevenue: "Protocol receives some % of trade fees.",
    SupplySideRevenue: "User fees minus Protocol fees.",
    HoldersRevenue: "ELITE Holders benefit from Protocol Revenue.",
  },
  "koi-finance-cl": {
    Fees: "Total swap fees paid by users.",
    UserFees: "Total swap fees paid by users.",
  },
  "zebra-v2": {
    Fees: "Users pay dynamic amount of fees per swap.",
    UserFees: "Users pay dynamic amount of fees per swap.",
    Revenue: "Zebra collects 25% revenue from swap fees.",
    ProtocolRevenue: "Zebra collects 25% revenue from swap fees.",
    SupplySideRevenue: "Zebra distributes 75% swap fees to LPs.",
  },
  "hybra-v3": {
    Volume: "Total swap volume collected from factory 0x2dC0Ec0F0db8bAF250eCccF268D7dFbF59346E5E",
    Fees: "Users paid 0.02%, 0.25% or 1% per swap.",
    UserFees: "Users paid 0.02%, 0.25% or 1% per swap.",
    Revenue: "25% swap fees collected by protocol Treasury.",
    ProtocolRevenue: "25% swap fees collected by protocol Treasury.",
    SupplySideRevenue: "75% swap fees distributed to LPs.",
  },
  "superswap-v3": {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    SupplySideRevenue: "LPs receive 20% of swap fees.",
    ProtocolRevenue: "Treasury receives 80% of swap fees.",
    Revenue: "Treasury receives 80% of swap fees.",
  },
  "sparkdex-v3": {
    Volume: "Total swap volume",
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    Revenue: "7.5% of the fees go to the protocol.",
    ProtocolRevenue: "2.5% of the fees go to the SparkDEX Foundation",
    HoldersRevenue: "5% of the fees are used in buybacks and burns of $SPRK",
    SupplySideRevenue: "87.5% of swap fees are distributed to LPs and 5% is distributed to $SPRK stakers",
  },
  "reservoir-tools-clmm": {
    Fees: "Swap fees paid by users on each trade.",
    UserFees: "User pays fees on each swap.",
    Revenue: "Protocol has no revenue.",
    ProtocolRevenue: "Protocol has no revenue.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue.",
  },
  "gliquid": {
    Volume: "Total users swap volume.",
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    Revenue: "13% swap fees distributed to Gliquid and Algebra team.",
    ProtocolRevenue: "Gliquid team collects 10% swap fees.",
    SupplySideRevenue: "87% swap fees distributed to LPs",
    HoldersRevenue: "No revenue for token holders.",
  },
  "hx-finance": {
    Volume: "Total trading volume on HX Finance DEX",
    Fees: "Trading fees collected from swap transactions",
    UserFees: "Trading fees collected from swap transactions",
    Revenue: "Protocol revenue from trading fees (13% or pool-specific community fee)",
    ProtocolRevenue: "Protocol revenue from trading fees (13% or pool-specific community fee)",
    SupplySideRevenue: "Fees distributed to liquidity providers (87% or remainder after protocol fee)",
  },
  "swapsicle-v2": {
    Fees: "Users pay 0.25% per swap.",
    UserFees: "Users pay 0.25% per swap.",
    Revenue: "Protocol collects 32% swap fees for protocol treasury and tokens buy back.",
    ProtocolRevenue: "Protocol collects 12% swap fees for protocol treasury.",
    HoldersRevenue: "Protocol collects 20% swap fees for token buy back.",
    SupplySideRevenue: "Protocol distributes 68% swap fees to LPs.",
  },
  "fenix-finance-v3": {
    Fees: "Users pay fees per swap.",
    UserFees: "Users pay 0.1% per swap.",
    Revenue: "Protocol collects 10% swap fees.",
    ProtocolRevenue: "Protocol collects 10% swap fees.",
    SupplySideRevenue: "90% swap fees distributes to LPs.",
  },
  "wagmi": {
    Fees: "Users paid 0.05%, 0.15%, 0.30%, or 1% per swap.",
    UserFees: "Users paid 0.05%, 0.15%, 0.30%, or 1% per swap.",
    SupplySideRevenue: "All swap fees go to LPs.",
    Revenue: "No revenue from swap fees.",
    ProtocolRevenue: "No revenue from swap fees.",
  },
  "spookyswap-v3": {
    Fees: "Each pool charge between 0.01% to 1% fee",
    UserFees: "Users pay between 0.01% to 1% fee",
    Revenue: "0 to 15% of the fee goes to treasury",
    HoldersRevenue: "Share of swap fee goes to xBOO stakers.",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "Liquidity providers get most of the fees of all trades in their pools",
  },
  "omni-exchange-v3": {
    Fees: "swap fees paid by users.",
    UserFees: "swap fees paid by users.",
    Revenue: "Protocol share from swap fees",
    ProtocolRevenue: "Protocol share from swap fees",
    HoldersRevenue: "No Holder Revenue",
    SupplySideRevenue: "Liquidity providers share fromswap fees",
  },
  "syncswap-v3": {
    Fees: "Swap fees from paid by users.",
    UserFees: "User pays fees on each swap.",
    Revenue: "Protocol have no revenue.",
    ProtocolRevenue: "Protocol have no revenue.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue.",
  },
}

const startMap: Record<string, string | number> = {
  "lynex": '2023-08-07',
  "zebra-v2": '2023-11-16',
  "hybra-v3": '2025-06-23',
  "echodex-v3": '2023-04-09',
  "sparkdex-v3": '2024-06-27',
  "gliquid": '2025-02-06',
  "hx-finance": '2025-08-01',
  "omni-exchange-v3": '2025-07-15',
}

// Fees-specific configs (same protocol name may have different config for fees vs dexs)
const feesConfigs: Record<string, Record<string, any>> = {
  "thick": {
    fantom: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    arbitrum: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    base: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    sonic: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
  },
  "2thick": {
    fantom: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    base: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
    sonic: { factory: '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24' },
  },
}

const feesMethodologyMap: Record<string, any> = {
  "thick": {
    UserFees: "Traders using Thick Liquidiy pay a Trading fee on each swap. Includes Flash Loan Fees.",
    Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
    Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
    ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
    HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
    SupplySideRevenue: "The portion of trading fees paid to liquidity providers.",
  },
  "2thick": {
    UserFees: "Traders using 2Thick Liquidiy pay a Trading fee on each swap. Includes Flash Loan Fees.",
    Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
    Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
    ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
    HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
    SupplySideRevenue: "The portion of trading fees paid to liquidity providers.",
  },
}

// Build dex protocols
const protocols: Record<string, any> = {}
for (const [name, config] of Object.entries(configs)) {
  const adapter = uniV3Exports(config, optionsMap[name])
  if (methodologyMap[name]) adapter.methodology = methodologyMap[name]
  if (startMap[name] !== undefined) (adapter as any).start = startMap[name]
  protocols[name] = adapter
}

// Build fees protocols
const feesProtocols: Record<string, any> = {}
for (const [name, config] of Object.entries(feesConfigs)) {
  const adapter = uniV3Exports(config)
  if (feesMethodologyMap[name]) adapter.methodology = feesMethodologyMap[name]
  if (methodologyMap[name]) adapter.methodology = methodologyMap[name]
  if (startMap[name] !== undefined) (adapter as any).start = startMap[name]
  feesProtocols[name] = adapter
}

export const { protocolList, getAdapter } = createFactoryExports(protocols)
export const fees = createFactoryExports(feesProtocols)
