import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HookOS — programmable token launchpad built on Uniswap v4 hooks.
//
// Fees are read from the exact fee events the contracts emit, never derived from
// a rate times a trade size. HookOS monetises through two different patterns and
// this adapter covers both:
//
//   1. ROUTED. Some modules push their native protocol fee to FeeRouter, whose
//      receive() emits FeeReceived(from, amount). `from` is indexed, so one query
//      covers bonding-curve trades, token launches, hook registrations, arena
//      battles, tournaments and the graduation hooks, each attributable to the
//      module that paid it. This also makes launch/registration fees exact even
//      though they are USD-pegged on-chain (TokenFactory.effectiveLaunchFee),
//      where a flat-rate assumption would be wrong.
//      `feeSources` is deliberately a SUPERSET of what has actually routed: most
//      of these modules pay a treasury that an admin can repoint at FeeRouter, so
//      they are mapped in advance and attributed the moment they do route. To
//      date only TokenFactory and BondingCurve ever have. An unmapped sender is
//      still counted, under LABEL.other, so a new module cannot go unreported.
//   2. DIRECT. Most modules never touch FeeRouter — they pay a treasury inline or
//      accrue to a pull ledger — so each is read at its own event: creator fees,
//      hook-author revenue, V3 launch LP fees, the $HOOK and stock pool taxes,
//      the v4 hook cuts, presale fees, bot trading fees and graduated LP fees.
//
// Two consequences of FeeRouter.receive() being native-only are worth stating.
// A module that pays it in ERC-20 (HookPool, LPLocker) emits nothing and is not
// counted — an acknowledged under-count, currently zero because no HookPool
// exists. And FeeRouter.unwrapAndDistribute() withdraws WETH into itself, which
// re-emits FeeReceived for hook fees already counted at the hook; the
// wrapped-native sender is therefore skipped.
//
// Addresses are the canonical deployment registry
// (protocol/contracts/deployments/addresses.json), keyed by chain id; contracts
// that are not deployed on a chain are simply absent below and are skipped.
// NB: the same address can host different roles across chains — contracts are
// deployed deterministically (same deployer + nonce ⇒ identical CREATE address),
// so always identify a contract by (chain, address), never by address alone.
type ChainConfig = {
  // Native-fee sink for the modules that route fees rather than accrue them.
  // Absent on Stable, which has no core deployment.
  FeeRouter?: string;
  BondingCurve?: string;
  HookRevenueVault?: string;
  // Enumerates HookPool AMM pools (the graduation target on HyperEVM).
  PoolFactory?: string;
  HookOSV3FeeVault?: string;
  // v4 hooks that take a HookOS cut of the swap. GraduationHook is
  // UniversalGraduationHook — the hook actually wired into graduated pools,
  // read from V4GraduationAdapterHooked.hook() on each chain.
  HookOSV4Hook?: string;
  LaunchHook?: string;
  GraduationHook?: string;
  HookWethTax?: string;
  StockTaxHook?: string;
  // Fee takers that pay a treasury directly and never touch FeeRouter.
  PresaleVault?: string;
  BotTradeRouter?: string[];
  LPFeeSplitter?: string;
  // App-layer modules. All native-only (no ERC-20 path). Each keeps its cut
  // until an admin sweep, so all are read at their own event, at accrual — and
  // excluded as FeeRouter senders, since the sweep recipient is caller-chosen
  // and could be FeeRouter itself.
  CreatorMarketplace?: string;
  CampaignMarketplace?: string;
  ProfileMonetization?: string;
  QuestSponsorship?: string;
  WalletProSubscription?: string;
  // Uniswap v4 singleton. It settles the hook cuts above on their behalf, so it
  // appears as a FeeReceived sender for fees already counted at the hook — it is
  // excluded, but ONLY on chains where at least one hook is watched, otherwise
  // excluding it would drop fees nothing else counts.
  v4PoolManager?: string;
  // Wrapped native. FeeRouter.unwrapAndDistribute() withdraws WETH into itself,
  // which trips receive() and re-emits FeeReceived for hook fees already counted
  // at the hook — so the wrapped-native contract is never a real fee sender.
  wrappedNative?: string;
  // FeeReceived sender ⇒ breakdown label. Lowercased.
  feeSources: Record<string, string>;
};

const LABEL = {
  curve: 'Bonding Curve Fees',
  launch: 'Token Launch Fees',
  registration: 'Hook Registration Fees',
  arena: 'Arena Battle Fees',
  v4: 'Graduated V4 Pool Fees',
  quickLaunch: 'Quick Launch Fees',
  v3Launch: 'V3 Launch LP Fees',
  hookTax: 'HOOK Pool Tax',
  marketplace: 'Marketplace Fees',
  copyTrading: 'Copy Trading Fees',
  feedBoost: 'Feed Boost Fees',
  partner: 'Partner Fees',
  profile: 'Profile Monetization Fees',
  quest: 'Quest Sponsorship Fees',
  subscription: 'Subscription Fees',
  kernel: 'Kernel Fees',
  lpLocker: 'LP Locker Fees',
  tournament: 'Tournament Fees',
  presale: 'Presale Fees',
  botTrading: 'Bot Trading Fees',
  lpSplit: 'Graduated LP Fees',
  stockTax: 'Stock Pool Tax',
  stockRewards: 'Stock Holder Rewards',
  other: 'Other Protocol Fees',
  creator: 'Creator Fees',
  hookAuthor: 'Hook Author Fees',
  buyback: 'Buyback and Burn',
};

const CONFIG: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    FeeRouter: "0x37F655bdf7C89E17eC1B6A143a572D277b59703C",
    BondingCurve: "0xc841eF17b424B00A46C5acebDEEbE2976F168AC7",
    HookRevenueVault: "0x36f61a66B00ED7248954A494574E6171CFc959a2",
    PoolFactory: "0xcDfD3B997EC5A2F9CA59955d9aCE30eD8dFbFEff",
    HookOSV3FeeVault: "0xC0d94a99398b0b3C14971F25F13445Ef3c7fb63c",
    v4PoolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    PresaleVault: "0x1F15e5Db9670F76a0C863A1D87DFaA037C82B602",
    BotTradeRouter: ["0x0Df97B522f8d280bEca2E2f547e62f17DA533da9"],
    LPFeeSplitter: "0xC3e9f677B16e84A12EAae10cCf3Ba166B5A02a79",
    // No graduation hook: V4GraduationAdapterHooked.hook() reverts on chain 1.
    wrappedNative: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    feeSources: {
      "0xa7d00760693cec4f8c622eed44c786a190fba342": LABEL.launch,        // TokenFactory
      "0x93f35a190e6b7ed05e7bbab78199720c0c849dde": LABEL.registration,  // HookRegistry
      "0x1a4bbd3cb922ffd6167f0a75fd037a3760d63b63": LABEL.arena,         // Arena
      "0xc841ef17b424b00a46c5acebdeebe2976f168ac7": LABEL.curve,         // BondingCurve
      "0x0dde71f9711693cabb46fad461e9f0cb27b96f53": LABEL.tournament,    // Events
      "0xcdc35bed68be2ad6245d93f8d310408d4ab93167": LABEL.v3Launch,      // HookOSV3Launcher
    },
  },
  [CHAIN.BSC]: {
    FeeRouter: "0x1a4BBd3cB922Ffd6167f0a75fd037A3760d63B63",
    BondingCurve: "0xbb141A22B4cAef996052b2ecC9F9ef2Cde259bcA",
    HookRevenueVault: "0xc841eF17b424B00A46C5acebDEEbE2976F168AC7",
    PoolFactory: "0x0d04627b6eFc9f546702969fF1faBD7a9642886f",
    HookOSV3FeeVault: "0x258093F7706E8b12D335149d8Df6AeDfa7E6D23A",
    HookOSV4Hook: "0xa8cfb668A65236f678BFaE6bA41ec3e61D8A0044",
    v4PoolManager: "0x28e2Ea090877bF75740558f6BFB36A5ffeE9e9dF",
    PresaleVault: "0x68f5e4622477c6FcF13Ca851667E042339490f44",
    BotTradeRouter: ["0xE61c1Bd903f635f192FBf7E43831BF62E0Df3645"],
    LPFeeSplitter: "0x19c279c03B4aaB972E7293b688c81801Aa90d8B2",
    GraduationHook: "0x000ef9d52e7E177f5468C10F14b3a09f84dAA0CC",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    CreatorMarketplace: "0xe37A32a58e30Df97E1d6D3E84fc8F613bE5c9180",
    CampaignMarketplace: "0xDa80b9bE913C243a6394a7A86e153AC03a8eAc50",
    ProfileMonetization: "0xd641fA4f0592d93CC9989659527936F998669c4B",
    QuestSponsorship: "0x8e6f4653f4a5060cFCCE84f5a249609D04568e81",
    WalletProSubscription: "0xa3e5dE74cd1d42A97A5CC0f45b7A24A73fb52736",
    feeSources: {
      "0x60dffa6940696e8f2df997b570d9feacc5eb1ef7": LABEL.launch,        // TokenFactory
      "0x0dde71f9711693cabb46fad461e9f0cb27b96f53": LABEL.registration,  // HookRegistry
      "0x2ef43362a9aa71dd23ba336275e976ac300f4864": LABEL.arena,         // Arena
      "0xb1d9aca82b1f011f7dc37c704f70d49df048fe3b": LABEL.arena,         // ArenaV2
      "0xbb141a22b4caef996052b2ecc9f9ef2cde259bca": LABEL.curve,         // BondingCurve
      "0x071668123e129d665b756edffae713b441cb69d6": LABEL.tournament,    // Events
      "0xdc9a19ea23e19944c448ed77079cf64396b59610": LABEL.feedBoost,     // FeedBoostAuction
      "0xe37a32a58e30df97e1d6d3e84fc8f613be5c9180": LABEL.marketplace,   // CreatorMarketplace
      "0xda80b9be913c243a6394a7a86e153ac03a8eac50": LABEL.marketplace,   // CampaignMarketplace
      "0xd036e55216c9cc3135cb291270f69184ce56be36": LABEL.copyTrading,   // CopyTrading
      "0x71d9e8e2fdca537e7295f10bc02c78883a43d2c7": LABEL.partner,       // PartnerSystem
      "0xd641fa4f0592d93cc9989659527936f998669c4b": LABEL.profile,       // ProfileMonetization
      "0x8e6f4653f4a5060cfcce84f5a249609d04568e81": LABEL.quest,         // QuestSponsorship
      "0xa3e5de74cd1d42a97a5cc0f45b7a24a73fb52736": LABEL.subscription,  // WalletProSubscription
      "0x2d7c972fb70b340aa0c9668395b8cf817ee71a74": LABEL.kernel,        // HookOSKernel
      "0x751232f04b05bf0cb9fe36ab9e0009feb97f49a4": LABEL.lpLocker,      // LPLocker
      "0xab058c222baae520cc83440f941628abf2f876fd": LABEL.v3Launch,      // HookOSV3Launcher
      "0xa8cfb668a65236f678bfae6ba41ec3e61d8a0044": LABEL.v4,            // HookOSV4Hook
    },
  },
  // Stable (988) has no core deployment — no BondingCurve, no FeeRouter, no v4.
  // Its only live launch path, and therefore its only fee source, is the HookOS
  // V3 direct-to-DEX launcher and the fee vault that custodies those positions.
  [CHAIN.STABLE]: {
    HookOSV3FeeVault: "0x8DebEd7101B2e6577909fA07491F484fC2A8Ad2c",
    PresaleVault: "0x2542575fF17770c5743F12A8a6705A63206de361",
    feeSources: {},
  },
  [CHAIN.HYPERLIQUID]: {
    FeeRouter: "0x8DebEd7101B2e6577909fA07491F484fC2A8Ad2c",
    BondingCurve: "0x93f35a190E6B7ed05E7bBAb78199720C0c849dDE",
    HookRevenueVault: "0x5c977d2fF0b8aD13ca0AbF954A219E31CF049C60",
    PoolFactory: "0xF2F1C1D5089995c55C9Bf0395ebb70EBBF17b61D",
    HookOSV3FeeVault: "0x502AA94344a5FCA6766C3fF382f1CdD435A7e6Ef",
    PresaleVault: "0xA5B6BD70911aa351AD971d302f16eB2656a17d19",
    BotTradeRouter: ["0xe79D1C0941E0448E3793afeA8dF0542c9B032343"],
    wrappedNative: "0x5555555555555555555555555555555555555555",
    feeSources: {
      "0x96c5e38362f86e52389e15a86247fb7326503c8d": LABEL.launch,        // TokenFactory
      "0x64e3167b2b4ea1b8e3ddcafe66a5b435be7cd75f": LABEL.registration,  // HookRegistry
      "0x9b3d636c27ad4cdebfbe1f182b2b63f66be7ade5": LABEL.arena,         // Arena
      "0x93f35a190e6b7ed05e7bbab78199720c0c849dde": LABEL.curve,         // BondingCurve
      "0x47c839295754307e635dc6bef89856267932dd38": LABEL.tournament,    // Events
      "0x2db1b1e2123c3d61b0cafe4af5864e4fab3a5f74": LABEL.v3Launch,      // HookOSV3Launcher
    },
  },
  [CHAIN.MEGAETH]: {
    FeeRouter: "0x69A8C492056F5f58e19d5DA65EBd1869BA24815b",
    BondingCurve: "0x6A2fAa5Da2B9F1515661f18160C0A0d584c0AC15",
    HookRevenueVault: "0x97e7B6e7F995F45bc20c35ACA02B2CD400864dF9",
    PoolFactory: "0x1106A0257bbB2f7950f5bcf366e966D24c6F5cDd",
    HookOSV3FeeVault: "0x710cd7173AdF70ff50428590210f746ac54De816",
    v4PoolManager: "0xaCB7e78fa05D562e0A5D3089ec896D57D057d38E",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    PresaleVault: "0xA62690b3D90ad7F0b09aB90B25D64989B3bcFe0A",
    BotTradeRouter: ["0x03D99492aB49204868556fCD768F135F5e711185"],
    LPFeeSplitter: "0x985F8Be988aB5029045d56069fD89a1aD19fB801",
    GraduationHook: "0xf79aFf336d8255f516A95B87A849C34bD34320Cc",
    CreatorMarketplace: "0xed2784ab5f5A82fF27E96AD2341E8BA28cf1d4d6",
    CampaignMarketplace: "0x59cb3d21f17132766c579BDd1D1B57Ad02470c23",
    ProfileMonetization: "0xA1A348a120BB2Fc10059870183db9a513C6A804d",
    QuestSponsorship: "0x47A66A65fC90349EaaFB1D51c18B61a2d4FFB91d",
    WalletProSubscription: "0x58235F1112de75606D18ECFD6a136D3745cB70A7",
    feeSources: {
      "0x9bb58abc4a41eac5692f42dc59e15b0efb92af81": LABEL.launch,        // TokenFactory
      "0xe1ecb2b6bb656ff32c886ff41da59a159eff41f0": LABEL.registration,  // HookRegistry
      "0x30801eab4c458cf8795eed77cae5e3f422678347": LABEL.arena,         // Arena
      "0xbdffc8b2db17fde04d53916e03dcb07ad6d56266": LABEL.arena,         // ArenaV2
      "0x6a2faa5da2b9f1515661f18160c0a0d584c0ac15": LABEL.curve,         // BondingCurve
      "0x77fbf854c2f376280599f5277a1a0c1d1b736edc": LABEL.tournament,    // Events
      "0x55ead32a8b5343e085b92ea087df0fbe60386ff7": LABEL.feedBoost,     // FeedBoostAuction
      "0xed2784ab5f5a82ff27e96ad2341e8ba28cf1d4d6": LABEL.marketplace,   // CreatorMarketplace
      "0x59cb3d21f17132766c579bdd1d1b57ad02470c23": LABEL.marketplace,   // CampaignMarketplace
      "0xd0d31e3fc15ac5f24e90de997bcc8442e2df4718": LABEL.copyTrading,   // CopyTrading
      "0xa29febd83f0977f39ed29221e6235da10cb5b35c": LABEL.partner,       // PartnerSystem
      "0xa1a348a120bb2fc10059870183db9a513c6a804d": LABEL.profile,       // ProfileMonetization
      "0x47a66a65fc90349eaafb1d51c18b61a2d4ffb91d": LABEL.quest,         // QuestSponsorship
      "0x58235f1112de75606d18ecfd6a136d3745cb70a7": LABEL.subscription,  // WalletProSubscription
      "0xb740b22560b93a7581f88acfe205d08432da71ea": LABEL.kernel,        // HookOSKernel
      "0x528bcecff5da16ce65c198fbe42da55a0088d4c2": LABEL.v3Launch,      // HookOSV3Launcher
    },
  },
  // Robinhood (4663) is HookOS's flagship chain: the only one running Quick
  // Launch (RHLaunchpad + LaunchHook) and the $HOOK v4 pool behind HookWethTax.
  [CHAIN.ROBINHOOD]: {
    FeeRouter: "0x14C9e52be5A5a148CDe2E4336Fee1c7a3338ff17",
    BondingCurve: "0x93f35a190E6B7ed05E7bBAb78199720C0c849dDE",
    HookRevenueVault: "0x2542575fF17770c5743F12A8a6705A63206de361",
    PoolFactory: "0xF2F1C1D5089995c55C9Bf0395ebb70EBBF17b61D",
    HookOSV3FeeVault: "0x2974cE6341067398A5C1E6c0C14F99ED1C3122EF",
    HookOSV4Hook: "0x85D5027AD0d3A8D58734Db244cde2De019Fb0044",
    LaunchHook: "0xA71B7482439C4f147abFe23cBa5312770f31C0c4",
    HookWethTax: "0x0a09EEdC282C7cd4360bdf3cc683112Da1A780CC",
    v4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    PresaleVault: "0x31f7C24979857F2a52E0dd653213959f3Ddd288B",
    BotTradeRouter: ["0xC46A8c55F7C1e4A82A0226fA2309713979EF4F28", "0xaB81b37326fA37092E81BAe17266d32933Eb0CDc"],
    LPFeeSplitter: "0xa3df1c2969452ad3F0C3ca041430E2a8EE2ffa80",
    GraduationHook: "0x102D845539515733D5D56a8542E65eb1961420cc",
    StockTaxHook: "0x45F983076500a670EB12B2F3Aa6863d53dC880CC",
    wrappedNative: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    CreatorMarketplace: "0x360E1FCEcACe39a7d96883e5Ae640DA6E88e6579",
    CampaignMarketplace: "0xd16e3Ed4ABf1957100DC4063F179C0Ccb7dd895E",
    ProfileMonetization: "0xD9Ff755b6113f80276fE36DCddF931084051FD68",
    QuestSponsorship: "0x75bD4983C60147217F3693cb7C45212a98CD3A1C",
    WalletProSubscription: "0x155C388f118C2B8eb58Ac2d4b23f1Ba99f95fd3B",
    feeSources: {
      "0x3e9e09c4759553e38a10aded3e0f3f46b3cdf162": LABEL.launch,        // TokenFactory
      "0x58f994034e465da801be25c2a411b198a03a4109": LABEL.registration,  // HookRegistry
      "0xbffcb23fd7db0bd9da801390d4bfae33de665ef7": LABEL.arena,         // Arena
      "0x93f35a190e6b7ed05e7bbab78199720c0c849dde": LABEL.curve,         // BondingCurve
      "0x509c3e1e9837df4b89b9fa1f14c527cd92b652fe": LABEL.tournament,    // Events
      "0xebe5fd0f60f4c282cdc5f96bac8e0903ce2e862c": LABEL.feedBoost,     // FeedBoostAuction
      "0x360e1fcecace39a7d96883e5ae640da6e88e6579": LABEL.marketplace,   // CreatorMarketplace
      "0xd16e3ed4abf1957100dc4063f179c0ccb7dd895e": LABEL.marketplace,   // CampaignMarketplace
      "0x9f5690a9128e4e80e9d08f0415dd804d5f7f7168": LABEL.copyTrading,   // CopyTrading
      "0xc143ac409756aab052ee87c37f6fab11785eaf60": LABEL.partner,       // PartnerSystem
      "0xd9ff755b6113f80276fe36dcddf931084051fd68": LABEL.profile,       // ProfileMonetization
      "0x75bd4983c60147217f3693cb7c45212a98cd3a1c": LABEL.quest,         // QuestSponsorship
      "0x155c388f118c2b8eb58ac2d4b23f1ba99f95fd3b": LABEL.subscription,  // WalletProSubscription
      "0xda4764d68789012416392455205c863bbbadd2d2": LABEL.kernel,        // HookOSKernel
      "0x316022a060284b84d6711a203e2578ee452c7858": LABEL.quickLaunch,   // RHLaunchpad
      "0x9b8d992704ddf38729535a641502bcc55734e0b8": LABEL.v3Launch,      // HookOSV3Launcher
      "0x85d5027ad0d3a8d58734db244cde2de019fb0044": LABEL.v4,            // HookOSV4Hook
      "0xa71b7482439c4f147abfe23cba5312770f31c0c4": LABEL.quickLaunch,   // LaunchHook
    },
  },
  [CHAIN.BASE]: {
    FeeRouter: "0x64E3167b2B4eA1b8e3DdCaFe66a5b435BE7cD75f",
    BondingCurve: "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40",
    HookRevenueVault: "0xA1B01d969D39647e5C98416779920d844a1FA961",
    PoolFactory: "0xEE71e51e757a3B36F027400CDb7182710564654A",
    HookOSV3FeeVault: "0x46d6b8168a43D908F306C243C30f4Aa035348B11",
    HookOSV4Hook: "0x624a452dD93Df9716085988c916c72219d8C8044",
    v4PoolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    PresaleVault: "0x6487B2554F207695B20a9aF60E4B1C6DFb360EFF",
    BotTradeRouter: ["0x2f6f6b6BCBe57830a592C3700c520721540A5524"],
    LPFeeSplitter: "0x6659D10166a3f546B2C9a0073AF1032C1e54A432",
    GraduationHook: "0x5f79b85f833eC0c88948Ba1b04faD5Be6C5D60Cc",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    CreatorMarketplace: "0x7B17C24Db13f94344A5b9183D92F232d7768Ffb9",
    CampaignMarketplace: "0x9D11060832B21C18329dD3BfEae3A6d43A552Fd8",
    ProfileMonetization: "0x0fD41607e121F300bc5785fEcB20e8680DCA6373",
    QuestSponsorship: "0xFEE62e423b3c4bE75315CeCeF08Eb6Ae8d4F4293",
    WalletProSubscription: "0xDd569e1E0224A7b413d1cd86493667450DF8242f",
    feeSources: {
      "0x9b3d636c27ad4cdebfbe1f182b2b63f66be7ade5": LABEL.launch,        // TokenFactory
      "0x467a8ab4a9b65d8da151f402021b17a147c058c5": LABEL.registration,  // HookRegistry
      "0x47c839295754307e635dc6bef89856267932dd38": LABEL.arena,         // Arena
      "0xa29febd83f0977f39ed29221e6235da10cb5b35c": LABEL.arena,         // ArenaV2
      "0x3c4b0f2d3d5bbdf4e0b323f0a8eec7b02cce6d40": LABEL.curve,         // BondingCurve
      "0x2c34ee38d96fbc890d341d80610375657594efcc": LABEL.tournament,    // Events
      "0xad31291ff64a26d2ee5346a3c96b07f6cee4b442": LABEL.feedBoost,     // FeedBoostAuction
      "0x7b17c24db13f94344a5b9183d92f232d7768ffb9": LABEL.marketplace,   // CreatorMarketplace
      "0x9d11060832b21c18329dd3bfeae3a6d43a552fd8": LABEL.marketplace,   // CampaignMarketplace
      "0xa3e5de74cd1d42a97a5cc0f45b7a24a73fb52736": LABEL.copyTrading,   // CopyTrading
      "0xbf0aae505764c6cee7826826bcccf140a39cd65c": LABEL.partner,       // PartnerSystem
      "0x0fd41607e121f300bc5785fecb20e8680dca6373": LABEL.profile,       // ProfileMonetization
      "0xfee62e423b3c4be75315cecef08eb6ae8d4f4293": LABEL.quest,         // QuestSponsorship
      "0xdd569e1e0224a7b413d1cd86493667450df8242f": LABEL.subscription,  // WalletProSubscription
      "0xe2ed29b574f5260f75cea5187880740c92694e20": LABEL.kernel,        // HookOSKernel
      "0x471e566b43b8c2693b18600ec0982e40787f06bd": LABEL.lpLocker,      // LPLocker
      "0x094e2b0b5b750441fc36a72b4754f6833231d76e": LABEL.v3Launch,      // HookOSV3Launcher
      "0x624a452dd93df9716085988c916c72219d8c8044": LABEL.v4,            // HookOSV4Hook
    },
  },
};

const ZERO = "0x0000000000000000000000000000000000000000";

// ── Event ABIs, verified against the deployed contract source ───────────────
// FeeRouter.receive() — fires for every native fee any module routes in.
const feeReceivedAbi = "event FeeReceived(address indexed from, uint256 amount)";
// BondingCurve (native) and HookPool (denominated in tokenIn) share this signature.
const creatorFeeCollectedAbi = "event CreatorFeeCollected(address indexed token, address indexed creator, uint256 amount)";
// HookRevenueVault — the hook-author share, peeled off before the FeeRouter push
// (BondingCurve._routeProtocolFee), so it is never part of FeeReceived.
const revenueRecordedEthAbi = "event RevenueRecordedETH(bytes32 indexed hookId, address indexed author, address indexed token, uint256 amount)";
// HookOSV3FeeVault — LP fees collected from a V3 launch position, split on collection.
const v3FeesCollectedAbi = "event FeesCollected(address indexed token, uint256 indexed tokenId, uint256 ethToCreator, uint256 ethToProtocol, uint256 ethToBuyback, uint256 tokenToCreator, uint256 tokenToProtocol)";
// HookWethTax — the $HOOK v4 pool tax. Always collected on the WETH leg
// (both emit sites pass inWeth = true), so nothing is dropped by the check below.
const taxCollectedAbi = "event TaxCollected(bytes32 indexed poolId, bool isBuy, bool inWeth, uint256 amount)";
// HookOSV4Hook and LaunchHook — the HookOS cut of a v4 swap, paid by
// PoolManager.take() in the swap's output currency.
const hookProtocolFeeAbi = "event ProtocolFeeCollected(bytes32 indexed poolId, address indexed token, uint256 amount)";
const launchCreatorFeeAbi = "event CreatorFeeAccrued(bytes32 indexed poolId, address indexed creator, address token, uint256 amount)";
// UniversalGraduationHook — same protocol-fee event as HookOSV4Hook, plus its own
// creator accrual under a different name.
const graduationCreatorTaxAbi = "event CreatorTaxAccrued(bytes32 indexed poolId, address indexed creator, address token, uint256 amount)";
// HookRevenueVault ERC-20 path, used by HookPool (the ETH path above is BondingCurve's).
const revenueRecordedAbi = "event RevenueRecorded(bytes32 indexed hookId, address indexed author, address indexed token, uint256 amount)";
// PresaleVault — 3% of the raise at settlement, plus a flat creation fee. Both
// native, both paid straight to the treasury.
const raiseFeeTakenAbi = "event RaiseFeeTaken(uint256 indexed id, uint256 amount)";
const creationFeeTakenAbi = "event CreationFeeTaken(address indexed creator, uint256 amount)";
// BotTradeRouter — feeBps skim on every bot buy/sell, native, paid to feeRecipient.
const botBoughtAbi = "event Bought(address indexed user, address indexed token, bytes32 indexed adapterId, uint256 amountIn, uint256 out, uint256 fee)";
const botSoldAbi = "event Sold(address indexed user, address indexed token, bytes32 indexed adapterId, uint256 amountIn, uint256 out, uint256 fee)";
// LPFeeSplitter — the LP fees of graduated v4 positions, split creator/protocol
// into a pull ledger. Distinct from the per-swap hook cut above.
const feesSplitAbi = "event FeesSplit(uint256 indexed positionId, address indexed token, uint256 creatorShare, uint256 protocolShare)";
// StockTaxHook — tokenized-stock pool tax, taken on the pool's quote leg. The
// slot is named `usdg` but is read live, because the Robinhood deployment has it
// pointed at 18dp WETH (see step 11).
const stockTaxSplitAbi = "event TaxSplit(bytes32 indexed poolId, bool isBuy, uint256 creatorFee, uint256 platformFee, uint256 vaultFee)";
// App-layer fee events. Each carries the protocol's cut explicitly; the
// counterparty leg (a seller's product revenue, a creator's tip, a quest
// reward) is a payout, not a HookOS fee, and is not counted.
const productPurchasedAbi = "event ProductPurchased(uint256 indexed productId, address indexed buyer, uint256 price, uint256 creatorAmount, uint256 platformAmount)";
const actionRecordedAbi = "event ActionRecorded(uint256 indexed campaignId, address indexed performer, uint256 performerPayout, uint256 platformFee, uint256 actionsCompleted)";
const tippedAbi = "event Tipped(address indexed tipper, address indexed creator, uint256 grossAmount, uint256 protocolFee, uint256 creatorAmount)";
const superfollowedAbi = "event Superfollowed(address indexed subscriber, address indexed creator, uint256 monthsPaid, uint256 grossAmount, uint256 protocolFee, uint256 creatorAmount, uint256 newExpiry)";
const questSponsoredAbi = "event QuestSponsored(uint256 indexed questId, address indexed sponsor, uint256 maxCompletions, uint256 rewardPerCompletion, uint256 rewardPool, uint256 protocolFee)";
const questBoostedAbi = "event QuestBoosted(uint256 indexed questId, address indexed sponsor, uint256 durationDays, uint256 boostExpiry, uint256 amountPaid)";
const proSubscribedAbi = "event ProSubscribed(address indexed wallet, uint256 indexed walletId, uint256 monthsPaid, uint256 amountPaid, uint256 newExpiry)";
const extensionPurchasedAbi = "event ExtensionPurchased(address indexed wallet, uint256 indexed extensionId, uint256 amountPaid, uint256 expiry)";
// HookOSV3FeeVault position record. `pairToken` is the currency the position is
// denominated in: the ethTo* legs are native only when it is the wrapped native,
// and are $HOOK on a $HOOK-paired launch (the event cannot be disambiguated
// without this read).
const v3PositionsAbi = "function positions(address) view returns (address token, uint256 tokenId, address creator, address locker, uint256 lockId, uint8 dex, uint8 pair, address pairToken, bool registered)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, api, chain } = options;
  const c = CONFIG[chain];

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // Add an amount denominated in `token`, where the v4 zero address means native.
  const addToken = (bal: any, token: string, amount: any, label: string) => {
    if (!token || token === ZERO) bal.addGasToken(amount, label);
    else bal.add(token, amount, label);
  };

  // HookPool AMM pools, enumerated for their creator fees below. NB: HookPool
  // pays its PROTOCOL fee with an ERC-20 transfer to FeeRouter, and receive()
  // only fires on native, so that leg emits no event and is not counted here —
  // an acknowledged under-count. No pool exists on any chain today.
  let hookPools: string[] = [];
  if (c.PoolFactory) {
    const count = Number(await api.call({ target: c.PoolFactory, abi: 'uint256:getPoolCount' }).catch(() => 0));
    if (count > 0) {
      hookPools = await api.multiCall({
        abi: 'function allPools(uint256) view returns (address)',
        calls: [...Array(count).keys()].map((i) => ({ target: c.PoolFactory!, params: [i] })),
        permitFailure: true,
      }).then((r: any[]) => r.filter(Boolean));
    }
  }
  // 1. Every native protocol fee that flows through FeeRouter, attributed to the
  //    module that paid it. The v4 PoolManager is excluded: it settles the hook
  //    cuts (step 5) on the hooks' behalf, which are counted at the hook itself.
  if (c.FeeRouter) {
    const watchesAHook = Boolean(c.HookOSV4Hook || c.LaunchHook || c.GraduationHook);
    const skip = new Set<string>();
    // Only exclude the PoolManager where a hook is actually counted at source —
    // on a chain with no watched hook, excluding it would drop fees outright.
    if (c.v4PoolManager && watchesAHook) skip.add(c.v4PoolManager.toLowerCase());
    // Unwrapped hook fees re-entering FeeRouter; already counted at the hook.
    // Gated the same way: with no watched hook there is no hook fee to have
    // counted already, so skipping the unwrap would drop a fee outright.
    if (c.wrappedNative && watchesAHook) skip.add(c.wrappedNative.toLowerCase());
    // App-layer modules accrue their cut internally and are read at their own
    // event in step 12, i.e. at accrual. Their admin sweep takes a caller-chosen
    // recipient, so it CAN be pointed at FeeRouter — which would re-emit
    // FeeReceived for fees already booked. Skipping them keeps each fee counted
    // once, at the source that measures it. Same principle as the PoolManager.
    for (const mod of [c.CreatorMarketplace, c.CampaignMarketplace, c.ProfileMonetization, c.QuestSponsorship, c.WalletProSubscription]) {
      if (mod) skip.add(mod.toLowerCase());
    }
    const feeLogs = await getLogs({ target: c.FeeRouter, eventAbi: feeReceivedAbi });
    for (const log of feeLogs) {
      const from = String(log.from).toLowerCase();
      if (skip.has(from)) continue;
      dailyFees.addGasToken(log.amount, c.feeSources[from] ?? LABEL.other);
    }
  }

  // 2. Bonding-curve creator fees — paid straight to the token's fee beneficiary,
  //    never routed through FeeRouter. Supply-side revenue.
  if (c.BondingCurve) {
    const creatorLogs = await getLogs({ target: c.BondingCurve, eventAbi: creatorFeeCollectedAbi });
    for (const log of creatorLogs) {
      dailyFees.addGasToken(log.amount, LABEL.creator);
      dailySupplySideRevenue.addGasToken(log.amount, LABEL.creator);
    }
  }

  // 3. HookPool creator fees, denominated in the pool's input token.
  if (hookPools.length) {
    const poolCreatorLogs = await getLogs({ targets: hookPools, eventAbi: creatorFeeCollectedAbi, flatten: true });
    for (const log of poolCreatorLogs) {
      addToken(dailyFees, log.token, log.amount, LABEL.creator);
      addToken(dailySupplySideRevenue, log.token, log.amount, LABEL.creator);
    }
  }

  // 4. Hook-author revenue: the share of the protocol fee credited per hook to
  //    its author. BondingCurve credits it as native (RevenueRecordedETH),
  //    HookPool as an ERC-20 (RevenueRecorded) — both are counted.
  if (c.HookRevenueVault) {
    const [authorEthLogs, authorTokenLogs] = await Promise.all([
      getLogs({ target: c.HookRevenueVault, eventAbi: revenueRecordedEthAbi }),
      getLogs({ target: c.HookRevenueVault, eventAbi: revenueRecordedAbi }),
    ]);
    for (const log of authorEthLogs) {
      dailyFees.addGasToken(log.amount, LABEL.hookAuthor);
      dailySupplySideRevenue.addGasToken(log.amount, LABEL.hookAuthor);
    }
    for (const log of authorTokenLogs) {
      addToken(dailyFees, log.token, log.amount, LABEL.hookAuthor);
      addToken(dailySupplySideRevenue, log.token, log.amount, LABEL.hookAuthor);
    }
  }

  // 5. The HookOS cut of a Uniswap v4 swap: HookOSV4Hook on graduated pools and
  //    LaunchHook on Quick Launch pools. Paid in the swap's output currency by
  //    PoolManager.take(), so it never appears as a FeeReceived native transfer
  //    when the output is an ERC-20, and is deliberately excluded from step 1
  //    when it is native.
  //    GraduationHook (UniversalGraduationHook) is the hook actually wired into
  //    graduated pools; HookOSV4Hook is the older standalone one.
  const v4Hooks = [
    [c.GraduationHook, LABEL.v4],
    [c.HookOSV4Hook, LABEL.v4],
    [c.LaunchHook, LABEL.quickLaunch],
  ].filter(([addr]) => Boolean(addr)) as [string, string][];
  for (const [hook, label] of v4Hooks) {
    const hookLogs = await getLogs({ target: hook, eventAbi: hookProtocolFeeAbi });
    for (const log of hookLogs) addToken(dailyFees, log.token, log.amount, label);
  }
  // Creator accruals on those pools are supply-side. A BUY-side accrual is paid
  // in the freshly launched token, which contributes zero while it is unpriceable
  // rather than a fabricated value.
  const creatorHooks = [
    [c.LaunchHook, launchCreatorFeeAbi],
    [c.GraduationHook, graduationCreatorTaxAbi],
  ].filter(([addr]) => Boolean(addr)) as [string, string][];
  for (const [hook, abi] of creatorHooks) {
    const creatorLogs = await getLogs({ target: hook, eventAbi: abi });
    for (const log of creatorLogs) {
      addToken(dailyFees, log.token, log.amount, LABEL.creator);
      addToken(dailySupplySideRevenue, log.token, log.amount, LABEL.creator);
    }
  }

  // 6. HookOS-V3 launch LP fees. Live on every chain — on Stable it is the only
  //    fee source. The buyback leg is spent buying and burning $HOOK, so it
  //    accrues to holders.
  //    The `ethTo*` legs are only native when the position is paired against the
  //    wrapped native: on a $HOOK-paired launch the very same fields are $HOOK
  //    amounts, and the event carries nothing to tell the two apart — hence the
  //    positions() read. The `tokenTo*` legs are always the launched token.
  if (c.HookOSV3FeeVault) {
    const v3Logs = await getLogs({ target: c.HookOSV3FeeVault, eventAbi: v3FeesCollectedAbi });
    if (v3Logs.length) {
      const launchTokens = [...new Set(v3Logs.map((l: any) => String(l.token)))];
      const positions = await api.multiCall({
        abi: v3PositionsAbi,
        calls: launchTokens.map((t) => ({ target: c.HookOSV3FeeVault!, params: [t] })),
        permitFailure: true,
      });
      const pairOf: Record<string, string> = {};
      launchTokens.forEach((t, i) => { if (positions[i]?.pairToken) pairOf[t.toLowerCase()] = positions[i].pairToken; });
      const wrapped = c.wrappedNative?.toLowerCase();

      for (const log of v3Logs) {
        const pair = pairOf[String(log.token).toLowerCase()];
        // Native only when the quote side is the wrapped native (or unknown on a
        // chain with no wrapped-native mapping, which is the WETH-paired default).
        const isNative = !pair || !wrapped || pair.toLowerCase() === wrapped;
        const quote = (bal: any, amount: any, label: string) =>
          isNative ? bal.addGasToken(amount, label) : bal.add(pair, amount, label);

        quote(dailyFees, log.ethToCreator + log.ethToProtocol + log.ethToBuyback, LABEL.v3Launch);
        quote(dailySupplySideRevenue, log.ethToCreator, LABEL.creator);
        quote(dailyHoldersRevenue, log.ethToBuyback, LABEL.buyback);

        const tokenSide = log.tokenToCreator + log.tokenToProtocol;
        if (tokenSide > 0n) {
          addToken(dailyFees, log.token, tokenSide, LABEL.v3Launch);
          addToken(dailySupplySideRevenue, log.token, log.tokenToCreator, LABEL.creator);
        }
      }
    }
  }

  // 7. The $HOOK Uniswap-v4 pool tax, skimmed off the WETH leg into the treasury.
  //    $HOOK launched direct-to-v4 with no bonding curve, and no Uniswap adapter
  //    counts this, so it is HookOS revenue that would otherwise go unreported.
  //    The taxed leg is the chain's wrapped native, taken from this chain's own
  //    config rather than a hardcoded Robinhood address, so that configuring
  //    HookWethTax on a second chain cannot price its tax in Robinhood's WETH.
  if (c.HookWethTax) {
    const taxLogs = await getLogs({ target: c.HookWethTax, eventAbi: taxCollectedAbi });
    for (const log of taxLogs) {
      if (!log.inWeth) continue;
      addToken(dailyFees, c.wrappedNative!, log.amount, LABEL.hookTax);
    }
  }

  // 8. Presale fees: a percentage of the raise taken at settlement plus a flat
  //    creation fee, both native, both paid straight to the treasury. PresaleVault
  //    is the one module deployed on all seven chains.
  if (c.PresaleVault) {
    const [raiseLogs, creationLogs] = await Promise.all([
      getLogs({ target: c.PresaleVault, eventAbi: raiseFeeTakenAbi }),
      getLogs({ target: c.PresaleVault, eventAbi: creationFeeTakenAbi }),
    ]);
    for (const log of raiseLogs) dailyFees.addGasToken(log.amount, LABEL.presale);
    for (const log of creationLogs) dailyFees.addGasToken(log.amount, LABEL.presale);
  }

  // 9. Bot trading fees: a skim on every buy and sell routed through the trading
  //    bot, native, paid to the fee recipient rather than through FeeRouter.
  if (c.BotTradeRouter?.length) {
    const [boughtLogs, soldLogs] = await Promise.all([
      getLogs({ targets: c.BotTradeRouter, eventAbi: botBoughtAbi, flatten: true }),
      getLogs({ targets: c.BotTradeRouter, eventAbi: botSoldAbi, flatten: true }),
    ]);
    for (const log of [...boughtLogs, ...soldLogs]) dailyFees.addGasToken(log.fee, LABEL.botTrading);
  }

  // 10. LP fees earned by graduated Uniswap-v4 positions, split creator/protocol
  //     into LPFeeSplitter's pull ledger. This is the position's own LP fee, not
  //     the per-swap hook cut counted in step 5.
  if (c.LPFeeSplitter) {
    const splitLogs = await getLogs({ target: c.LPFeeSplitter, eventAbi: feesSplitAbi });
    for (const log of splitLogs) {
      addToken(dailyFees, log.token, log.creatorShare + log.protocolShare, LABEL.lpSplit);
      addToken(dailySupplySideRevenue, log.token, log.creatorShare, LABEL.creator);
    }
  }

  // 11. Tokenized-stock pool tax (Robinhood), split three ways: creator, platform
  //     treasury, and the reward vault that buys stocks for holders.
  //     The taxed leg is whatever the hook's quote-currency slot points at. That
  //     slot is NAMED `usdg`, but the live Robinhood deployment has it set to
  //     WETH (18dp) — so it is read from the contract rather than assumed, or
  //     6dp USDG accounting would overstate these fees by a factor of 1e12.
  if (c.StockTaxHook) {
    const taxToken = await api.call({ target: c.StockTaxHook, abi: 'address:usdg' }).catch(() => undefined);
    const stockLogs = taxToken ? await getLogs({ target: c.StockTaxHook, eventAbi: stockTaxSplitAbi }) : [];
    for (const log of stockLogs) {
      addToken(dailyFees, taxToken, log.creatorFee + log.platformFee + log.vaultFee, LABEL.stockTax);
      addToken(dailySupplySideRevenue, taxToken, log.creatorFee, LABEL.creator);
      addToken(dailyHoldersRevenue, taxToken, log.vaultFee, LABEL.stockRewards);
    }
  }

  // 12. App-layer fees. These modules keep their cut internally until an admin
  //     sweep rather than routing it, so each is read at its own event. Only the
  //     protocol's own cut is counted: the seller's product revenue, the
  //     creator's tip and the quest reward pool are payouts, not HookOS fees.
  const appFees: [string | undefined, string, string, string][] = [
    [c.CreatorMarketplace, productPurchasedAbi, 'platformAmount', LABEL.marketplace],
    [c.CampaignMarketplace, actionRecordedAbi, 'platformFee', LABEL.marketplace],
    [c.ProfileMonetization, tippedAbi, 'protocolFee', LABEL.profile],
    [c.ProfileMonetization, superfollowedAbi, 'protocolFee', LABEL.profile],
    [c.QuestSponsorship, questSponsoredAbi, 'protocolFee', LABEL.quest],
    [c.QuestSponsorship, questBoostedAbi, 'amountPaid', LABEL.quest],
    [c.WalletProSubscription, proSubscribedAbi, 'amountPaid', LABEL.subscription],
    [c.WalletProSubscription, extensionPurchasedAbi, 'amountPaid', LABEL.subscription],
  ];
  for (const [target, eventAbi, field, label] of appFees) {
    if (!target) continue;
    const logs = await getLogs({ target, eventAbi });
    for (const log of logs) dailyFees.addGasToken(log[field], label);
  }

  // Revenue = all fees minus the creator/hook-author (supply-side) share; of
  // that, the holder legs are split out and the rest is retained by the protocol.
  // skipBreakdown: subtract() is not label-aware, so carrying the fee breakdown
  // across would leave Revenue itemised by gross-fee labels that still include
  // the supply-side legs it just subtracted — totals right, breakdown wrong.
  // Only Fees, SupplySideRevenue and HoldersRevenue publish a breakdown.
  // It has to be passed as the SECOND argument: the SDK's getOptions() defaults
  // a missing second argument to {} and then assigns it over the third, so
  // addBalances(x, undefined, { skipBreakdown }) silently drops the flag. The
  // cast is needed only because the option is typed on the third parameter.
  const skipBreakdown = { skipBreakdown: true } as any;
  dailyRevenue.addBalances(dailyFees, skipBreakdown);
  dailyRevenue.subtract(dailySupplySideRevenue);
  dailyProtocolRevenue.addBalances(dailyRevenue, skipBreakdown);
  dailyProtocolRevenue.subtract(dailyHoldersRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Every fee HookOS charges, read from the contracts' own fee events. Native fees routed through FeeRouter are attributed to the module that paid them: bonding-curve trades, token launches, hook registrations, arena battles and tournaments. Added to that are the fees that never touch FeeRouter and are read at source: creator fees, hook-author revenue (HookRevenueVault), HookOS-V3 launch LP fees on all seven chains (HookOSV3FeeVault), presale raise and creation fees (PresaleVault, the one module live on every chain), bot trading fees (BotTradeRouter), LP fees of graduated Uniswap-v4 positions (LPFeeSplitter), the HookOS cut of v4 swaps taken by the graduation and Quick Launch hooks, the $HOOK v4 pool tax (HookWethTax) and the tokenized-stock pool tax (StockTaxHook).",
  Revenue: "Total fees minus the supply-side share paid to token creators and hook authors.",
  ProtocolRevenue: "Revenue retained by the protocol: revenue minus the share spent buying back and burning $HOOK.",
  HoldersRevenue: "Fees that accrue to holders: the launch LP fee leg spent buying back and burning $HOOK, and the stock pool tax routed to the vault that buys tokenized stocks for holders.",
  SupplySideRevenue: "Earnings paid out to token creators (bonding curve, HookPool, Quick Launch and V3 launch LP fees) and to hook authors (their per-hook share of the protocol fee).",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.curve]: 'Protocol fee on bonding-curve buys and sells.',
    [LABEL.launch]: 'Fee charged per token launch (USD-pegged on-chain, so the exact amount paid is used).',
    [LABEL.registration]: 'Fee charged per hook registration.',
    [LABEL.arena]: 'Protocol cut of settled arena battle pots.',
    [LABEL.v4]: 'HookOS cut of swaps on graduated Uniswap-v4 pools, taken by HookOSV4Hook and by UniversalGraduationHook.',
    [LABEL.quickLaunch]: 'Quick Launch revenue on Robinhood: the HookOS cut of swaps on direct-to-v4 pools taken by LaunchHook, plus the launch fees RHLaunchpad routes to FeeRouter.',
    [LABEL.v3Launch]: 'HookOS-V3 direct-to-DEX launch revenue: LP fees collected from the launch positions — both the quote leg (native, or the pair token on a non-native-paired launch) and the launched-token leg — plus the launch fees HookOSV3Launcher routes to FeeRouter.',
    [LABEL.hookTax]: 'Tax skimmed from the WETH leg of every $HOOK Uniswap-v4 swap.',
    [LABEL.marketplace]: 'Creator and campaign marketplace fees.',
    [LABEL.copyTrading]: 'Copy-trading fees.',
    [LABEL.feedBoost]: 'Feed boost auction fees.',
    [LABEL.partner]: 'Partner and ambassador program fees.',
    [LABEL.profile]: 'Profile monetization fees (tips and subscriptions).',
    [LABEL.quest]: 'Quest sponsorship fees.',
    [LABEL.subscription]: 'Wallet Pro subscription fees.',
    [LABEL.kernel]: 'HookOS kernel module fees.',
    [LABEL.lpLocker]: 'LP locker fees.',
    [LABEL.presale]: 'Percentage of the raise taken when a presale settles, plus the flat presale creation fee.',
    [LABEL.botTrading]: 'Skim on buys and sells routed through the HookOS trading bot.',
    [LABEL.lpSplit]: 'LP fees earned by graduated Uniswap-v4 positions custodied by LPFeeSplitter.',
    [LABEL.stockTax]: 'Tax on tokenized-stock pool swaps, taken on the pool\'s quote leg (read live from the hook — WETH on the current Robinhood deployment).',
    [LABEL.tournament]: 'Protocol cut of tournament and event prize pools.',
    [LABEL.other]: 'Native fees routed to FeeRouter by a HookOS module not individually mapped.',
    [LABEL.creator]: 'Share of trading and LP fees routed to token creators.',
    [LABEL.hookAuthor]: 'Share of the protocol fee credited to the authors of the hooks a token runs.',
  },
  SupplySideRevenue: {
    [LABEL.creator]: 'Token creator earnings.',
    [LABEL.hookAuthor]: 'Hook author earnings.',
  },
  HoldersRevenue: {
    [LABEL.buyback]: 'Launch LP fees spent buying back and burning $HOOK.',
    [LABEL.stockRewards]: 'Stock pool tax routed to the vault that buys tokenized stocks for token holders.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    [CHAIN.BASE, { start: '2026-06-05' }],
    [CHAIN.HYPERLIQUID, { start: '2026-06-07' }],
    [CHAIN.MEGAETH, { start: '2026-06-14' }],
    [CHAIN.BSC, { start: '2026-06-17' }],
    [CHAIN.ETHEREUM, { start: '2026-06-18' }],
    [CHAIN.ROBINHOOD, { start: '2026-07-02' }],
    // Stable's only HookOS deployment is the V3 stack; the fee vault's first
    // block on chain 988 is 32821789 (2026-07-23).
    [CHAIN.STABLE, { start: '2026-07-23' }],
  ],
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
