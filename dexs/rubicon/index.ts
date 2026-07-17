import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";

// ---------------------------------------------------------------------------
// Rubicon — daily trading volume + fees across four systems on four chains.
//
//   Aquila V2 — UniswapV2-fork constant-product AMM
//   CLMM V3   — UniswapV3-fork concentrated liquidity
//   Classic   — RubiconMarket on-chain order book (LogTake/emitTake events)
//   Gladius   — UniswapX-fork RFQ reactor (Fill events resolve to ERC20 transfers)
//
// Address source: docs.rubicon.finance/developers/deployments (verified live
// 2026-07-09; see RubiconDeFi/rubicon-integrations scripts/).
//
// Per-system contributions are tagged via the SDK's `balance.add(_, _, label)`
// metric so DefiLlama renders Aquila / CLMM / Classic / Gladius as separate
// breakdown series on the protocol page.
// ---------------------------------------------------------------------------

const AQUILA_V2: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x7bad585c3ae4ae266f92a4af13b388bc7b26067c',
  [CHAIN.OPTIMISM]: '0x3B2C6fe3039B42f00E98b76531C05932abfB258e',
  [CHAIN.ARBITRUM]: '0xEca3EA559b7566e610d113bbA8D1B15B085C9c68',
  [CHAIN.BASE]:     '0xA5cA8Ba2e3017E9aF3Bd9EDa69e9E8C263Abf6cD',
}

const CLMM_V3: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0xDf62D9e51d7c08360dcd41931A2e6B97FF8C73E8',
  [CHAIN.OPTIMISM]: '0x53f64267EDE764C53ABEbCc768aD7A96c6006D8a',
  [CHAIN.ARBITRUM]: '0x045B7012CbD158C1b48874310F985Adb48aA62ba',
  [CHAIN.BASE]:     '0xB5E5A9e628FEF819150A6E5127aB481cee5d6Ca9',
}

// CLMM pregenesis pools — fallback pool set used when the factory-based path
// (which depends on the TVL adapter's R2-cached PoolCreated log scan) returns
// empty. New pools created after snapshot date are NOT picked up by the
// fallback — for those, the factory path needs to succeed (which it will once
// the TVL adapter has run once and populated R2).
// Snapshot 2026-07-09: full PoolCreated log scan of each factory via
// Blockscout (10 ETH / 9 OP / 15 Arb / 23 Base pools; lowercase, sorted).
const CLMM_PREGENESIS_POOLS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ['0x028ab215a083f85233965b2c227d7246a1485a93','0x12f6541d6415d9709af49665005d7e5efa89cef7','0x2449aadcc68182dc40cd9d9e2a14957ecafe8ea6','0x6000ee55d968ab528b56349a6b70bbd4d03ccd93','0x61c611769e2630983a8ea3dce9d90f24ab7a7fb6','0x9737b4f2559f795fc137d270b28f6667d25ee65e','0xaceea35546823865cc92618d7233886fa0325a85','0xb51e9bd9083d66dd479e441fa847fb0c703d0424','0xdbb54a50ea089cf7d4f91a4cec707c4d104e7704','0xe7c40cfaab7ea4084a34a89387265db9d5611a89'],
  [CHAIN.OPTIMISM]: ['0x192fc958e74569cf98117c8690bf6de6fbf686fd','0x40c20c5ef2d863e4a06a3ec59a8fb86f99bb1928','0x7760b1b80fbb770d15aa54c3eaa54e5ca97740d0','0x7afb406e277e2c8d3837400667ef0617d8c23692','0x8d046c46412a8afbf612ed046938e9858491ecbc','0x9b07854f79f2e178c9e81471b59fa4e6ddf5e617','0xad651a1d4ef32596fc5fb9eff30eafdd4187248c','0xaebbf83f3d56e201b806b5537ecd7863b14d32fc','0xedb836009053955cf31dd79d84ef8fced9293d65'],
  [CHAIN.ARBITRUM]: ['0x17191d9c1d0b42d2ff967baa043b604d56f54b4e','0x1dd95f3c2ca1e01b9ecf81453a03187c7bd954d5','0x31168cfc7ffe206ba651224b017170953c2ee1b8','0x388930a1893167a93476dfe8a07f3615d97db7c5','0x5ea431fad22e75d62e7d74745c23d12f2e1b0161','0xa1dc8490257633abc8599471a2a0707a2f6ba5d5','0xbd10851ad216785913eedfd845042ca684b0a9e4','0xbf1df812ee0e85644b6dc20e5214c6521482e0b6','0xc1c4f5313bc9f6947573e0fa3279b3f651694c76','0xc4f308b39411da159367ea3284af51ce1ad05e0e','0xc68b7d9ea68e5d4763e620c3aa0e940808baa236','0xd2806623e11021b7aa589b8bc75c615b2fda7b62','0xe9a76612370ec2c3f20c2c96800a4ad7f0839e51','0xee57310555a957cec1debb65b1e165d7c9ed700f','0xee9f158cf74059b1df239ac3d365dc7ead006233'],
  [CHAIN.BASE]:     ['0x002ce7bb4c5d130ed79c908217ae565f537148cf','0x0ba8ffab522342bd76f094d48415a850dcf976bf','0x1d265c8c84cf21ee435e067588bdbdea514110a4','0x2dca4ce76d38d2c14486932d0a07ec594f447f26','0x2e95713f63b93a5934034d462169f1f0c4b3a712','0x47e66a90e38d080cec076d1aef184673ea1b1f07','0x52430b5c47fb4fc6b336d45ee3aaabfbab39bdee','0x554644e713252401e6b5b18c9db17f4dd21ed5b5','0x56bce4571a7d13975a5f3d2f2262467f28fd5d6e','0x58f0d527ce2696693e4bf5da1242c92ae647eeea','0x604721a075977a3311f53ea72229a54913b43280','0x66b2a16b47ab18d339ca60bcb1e6f6cb7b9ff134','0x6eeabe5038ef192d615d743b8bd67368749a95d5','0x8a85cc9cfa7ca03e2a5a27211d71322759f76c1f','0x8bab7c87120bc87dbf8d2b0a0fd6a17ba40294e1','0x902e988a0ebf2642504aba2889e98b6ee4b5a6a7','0x9dbea192ed73543c04318f8868df09c0427fd016','0xa505d8c28443fd56accd8675c5a5809adcf5ff0f','0xa606d0bd0d1547faa740e2cee62a2dfa58de62d1','0xe91a58e346968c3405775d046e960201f7253378','0xf34c8ac1ff95dbf4410881ee676c00e4eca65b42','0xff37be987ad92c7103a9551bc5bd204828d243d7','0xffcc108fe7e6d21e4944ac5acd976755c53bf8a7'],
}

// Classic — RubiconMarket order book. getFeeBPS() == 2 (0.02% taker fee) on
// all 3 chains (re-verified 2026-07-09). Order-book volume is currently
// dormant (zero takes in recent block windows on all three chains); AMM + RFQ
// systems carry live flow. Included for historical completeness and so the
// line returns automatically if activity resumes.
const CLASSIC_MARKET: Record<string, string> = {
  [CHAIN.OPTIMISM]: '0x7a512d3609211e719737E82c7bb7271eC05Da70d',
  [CHAIN.ARBITRUM]: '0xC715a30FDe987637A082Cf5F19C74648b67f2db8',
  [CHAIN.BASE]:     '0x9A5215E96E1185d4e6002C95C3Cc0aB6eEaD354F',
}

// TWO take-event families (verified via raw on-chain logs + verified-source
// ABIs 2026-07-09): v1 LogTake fired on Optimism only, until the 2023-05-25
// v2 upgrade; the v2 family (emitTake) is what all three chains emit today —
// Arb/Base have NEVER emitted LogTake (zero-result lifetime topic0 queries).
// Both are scanned so historical OP backfills stay correct. Indexed layouts
// confirmed against the first OP trade (blk 24606: topics [pair, maker,
// taker], id in data) and the verified v2 implementation ABI (Arb impl
// 0x76A9058A...c5c5c: topics [id, pair, maker], taker in data).
const CLASSIC_LOGTAKE_ABI =
  'event LogTake(bytes32 id, bytes32 indexed pair, address indexed maker, address pay_gem, address buy_gem, address indexed taker, uint128 take_amt, uint128 give_amt, uint64 timestamp)'
const CLASSIC_EMITTAKE_ABI =
  'event emitTake(bytes32 indexed id, bytes32 indexed pair, address indexed maker, address taker, address pay_gem, address buy_gem, uint128 take_amt, uint128 give_amt)'

// Gladius — UniswapX-fork RFQ reactors. Volume = ERC20 received by swappers
// from fillers on the day of each Fill event.
const GLADIUS_REACTORS: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: ['0x6d81571b4c75ccf08bd16032d0ae54dbaff548b0'],
  [CHAIN.BASE]:     ['0x3c53c04d633bec3fb0de3492607c239bf92d07f9'],
  [CHAIN.ETHEREUM]: ['0x3C53c04d633bec3fB0De3492607C239BF92d07f9', '0xF08DB8D79312ce610aEED9463EdE1A6BB8aE4235'],
  [CHAIN.OPTIMISM]: ['0xcb23e6c82c900e68d6f761bd5a193a5151a1d6d2', '0x98169248bdf25e0e297ea478ab46ac24058fac78', '0x95b7F3662Ba73b3fF35874Af0E09b050dB03118B'],
}

const GLADIUS_FILL_ABI =
  'event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)'

// Aquila protocol fee = 1/6 of LP fee on chains where factory.feeTo is set.
// Verified live 2026-07-09: ON for OP/Arb/Base, OFF for mainnet (feeTo 0x0).
const AQUILA_REVENUE_RATIO: Record<string, number> = {
  [CHAIN.ETHEREUM]: 0,
  [CHAIN.OPTIMISM]: 1 / 6,
  [CHAIN.ARBITRUM]: 1 / 6,
  [CHAIN.BASE]:     1 / 6,
}

const CLASSIC_FEE_BPS = 2
const CLASSIC_FEE_RATE = CLASSIC_FEE_BPS / 10_000 // 0.0002

// Breakdown labels — chosen for readability on the DefiLlama protocol page.
const LBL_AQUILA  = 'Aquila V2'
const LBL_CLMM    = 'CLMM V3'
const LBL_CLASSIC = 'Classic'
const LBL_GLADIUS = 'Gladius'

const fetch = async (options: FetchOptions) => {
  const chain = options.chain
  const dailyVolume            = options.createBalances()
  const dailyFees              = options.createBalances()
  const dailyRevenue           = options.createBalances() // protocol cut
  const dailyProtocolRevenue   = options.createBalances() // same as dailyRevenue
  const dailySupplySideRevenue = options.createBalances() // LP cut

  // === Aquila V2 ============================================================
  // 30 bps total LP fee. revenueRatio = 1/6 on chains where factory.feeTo is set.
  if (AQUILA_V2[chain]) {
    const revenueRatio = AQUILA_REVENUE_RATIO[chain] ?? 0
    const aquilaFetch = getUniV2LogAdapter({
      factory: AQUILA_V2[chain],
      fees: 0.003,
      userFeesRatio: 1,
      revenueRatio,
      protocolRevenueRatio: revenueRatio,
      allowReadPairs: true,
    })
    const aq = await aquilaFetch(options)
    if (aq?.dailyVolume)             dailyVolume.addBalances(aq.dailyVolume, LBL_AQUILA)
    if (aq?.dailyFees)               dailyFees.addBalances(aq.dailyFees, LBL_AQUILA)
    if (aq?.dailyRevenue)            dailyRevenue.addBalances(aq.dailyRevenue, LBL_AQUILA)
    if (aq?.dailyProtocolRevenue)    dailyProtocolRevenue.addBalances(aq.dailyProtocolRevenue, LBL_AQUILA)
    if (aq?.dailySupplySideRevenue)  dailySupplySideRevenue.addBalances(aq.dailySupplySideRevenue, LBL_AQUILA)
  }

  // === CLMM V3 ==============================================================
  // Per-pool fee tier (5/30/100 bps; raw fee units 500/3000/10000 from PoolCreated). Protocol fee
  // defaults to 0 — factory.setFeeProtocol() is not enabled on any Rubicon
  // pool (UniV3 default). All LP fees go to suppliers.
  //
  // Discovery is best-effort and layered: try factory-based PoolCreated
  // log scan first (covers new pools auto-discovered by the TVL adapter's
  // R2 cache), then fall back to the embedded pregenesis pool list so this
  // adapter still reports CLMM activity even if the R2 cache is empty or
  // stale.
  if (CLMM_V3[chain]) {
    let cl: any
    try {
      cl = await getUniV3LogAdapter({
        factory: CLMM_V3[chain],
        userFeesRatio: 1,
        revenueRatio: 0,
        protocolRevenueRatio: 0,
      })(options)
    } catch (e: any) {
      // Factory path depends on the TVL adapter's R2-cached PoolCreated scan;
      // fall back to the embedded pregenesis snapshot when the cache is empty.
      const pregenesis = CLMM_PREGENESIS_POOLS[chain]
      if (!pregenesis?.length) throw e
      cl = await getUniV3LogAdapter({
        pools: pregenesis,
        userFeesRatio: 1,
        revenueRatio: 0,
        protocolRevenueRatio: 0,
      })(options)
    }
    if (cl?.dailyVolume)             dailyVolume.addBalances(cl.dailyVolume, LBL_CLMM)
    if (cl?.dailyFees)               dailyFees.addBalances(cl.dailyFees, LBL_CLMM)
    if (cl?.dailySupplySideRevenue)  dailySupplySideRevenue.addBalances(cl.dailySupplySideRevenue, LBL_CLMM)
  }

  // === Classic — RubiconMarket order book ==================================
  // 2 bps taker fee. 100% protocol revenue (order book has no LP layer).
  if (CLASSIC_MARKET[chain]) {
    // Scan both event families: v1 LogTake (OP history pre-2023-05-25) and
    // v2 emitTake (all chains today). On any given day at most one family
    // fires per chain, so no double count.
    const logs = [
      ...await options.getLogs({
        target: CLASSIC_MARKET[chain],
        eventAbi: CLASSIC_LOGTAKE_ABI,
      }),
      ...await options.getLogs({
        target: CLASSIC_MARKET[chain],
        eventAbi: CLASSIC_EMITTAKE_ABI,
      }),
    ]
    // addOneToken picks one side via core-asset check (see helpers/prices.ts),
    // so calling it once per leg yields exactly one trade-notional contribution
    // per take event, in line with the canonical UniV2 helper convention.
    const classicVol  = options.createBalances()
    const classicFees = options.createBalances()
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: classicVol,  token0: log.pay_gem, token1: log.buy_gem, amount0: log.take_amt, amount1: log.give_amt })
      addOneToken({ chain, balances: classicFees, token0: log.pay_gem, token1: log.buy_gem, amount0: Number(log.take_amt) * CLASSIC_FEE_RATE, amount1: Number(log.give_amt) * CLASSIC_FEE_RATE })
    })
    dailyVolume.addBalances(classicVol, LBL_CLASSIC)
    dailyFees.addBalances(classicFees, LBL_CLASSIC)
    dailyRevenue.addBalances(classicFees, LBL_CLASSIC)
    dailyProtocolRevenue.addBalances(classicFees, LBL_CLASSIC)
  }

  // === Gladius — UniswapX-fork reactors ====================================
  // Resolve each Fill to the cumulative ERC20 transfers fillers → swappers on
  // the day. (RFQ orders settle by direct ERC20 transfer; the swapper's
  // received amount is the cleanest available volume signal.)
  if (GLADIUS_REACTORS[chain]) {
    const fills = await options.getLogs({
      targets: GLADIUS_REACTORS[chain],
      eventAbi: GLADIUS_FILL_ABI,
    })
    const fillers  = new Set<string>()
    const swappers = new Set<string>()
    fills.forEach((f: any) => { fillers.add(f.filler); swappers.add(f.swapper) })
    if (fillers.size > 0 && swappers.size > 0) {
      const gladiusVolume = await addTokensReceived({
        options,
        targets: Array.from(swappers),
        fromAdddesses: Array.from(fillers),
      })
      dailyVolume.addBalances(gladiusVolume, LBL_GLADIUS)
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyUserFees: dailyFees,
  }
}

const methodology = {
  UserFees:
    'Identical to Fees — every fee is paid by the trader/taker.',
  Volume:
    'Total daily trading volume across Rubicon\'s four systems: Aquila V2 (UniV2-fork ' +
    'AMM, Swap events on pairs), CLMM V3 (UniV3-fork concentrated liquidity, Swap events ' +
    'on pools), Classic (RubiconMarket order book, LogTake/emitTake events; currently dormant), ' +
    'and Gladius (UniswapX-fork RFQ reactor, Fill events resolved to filler→swapper ERC20 ' +
    'transfers).',
  Fees:
    'Total user-paid trading fees across all four systems: Aquila V2 = 30 bps × swap ' +
    'notional, CLMM V3 = per-pool tier (5/30/100 bps) × swap notional, Classic = ' +
    '2 bps × take-event notional. Gladius per-order fees are not surfaced in this adapter ' +
    '(see the Rubicon fees adapter).',
  Revenue:
    'Protocol cut: Aquila V2 ~5 bps (1/6 of LP fee) on OP/Arb/Base where factory.feeTo ' +
    'is set, 0 on mainnet; CLMM V3 0 by default (factory.setFeeProtocol not enabled); ' +
    'Classic 100% of the 2 bps taker fee.',
  ProtocolRevenue:
    'Identical to Revenue — Rubicon does not currently route fees to a holders/buyback bucket.',
  SupplySideRevenue:
    'LP cut: dailyFees minus protocol Revenue. Aquila ~25 bps to LPs (OP/Arb/Base) or ' +
    '30 bps (mainnet, fee switch off). CLMM 100% of pool tier to LPs. Classic and Gladius ' +
    'have no LP layer.',
}

const breakdownMethodology = {
  Volume: {
    [LBL_AQUILA]:  'Swap events on Aquila V2 pairs, factory-enumerated.',
    [LBL_CLMM]:    'Swap events on CLMM V3 pools, discovered via PoolCreated event scan.',
    [LBL_CLASSIC]: 'LogTake (v1) and emitTake (v2) events on RubiconMarket order book.',
    [LBL_GLADIUS]: 'Fill events on Gladius reactors resolved to filler→swapper ERC20 transfers.',
  },
  Fees: {
    [LBL_AQUILA]:  '30 bps × swap notional on every Aquila pair.',
    [LBL_CLMM]:    'Per-pool tier (5/30/100 bps) × swap notional.',
    [LBL_CLASSIC]: '2 bps × take-event notional (getFeeBPS() = 2, re-verified 2026-07-09).',
  },
  Revenue: {
    [LBL_AQUILA]:  '~5 bps (1/6 of LP fee) on OP/Arb/Base; 0 on mainnet.',
    [LBL_CLASSIC]: '100% of the 2 bps taker fee.',
  },
  ProtocolRevenue: {
    [LBL_AQUILA]:  '~5 bps (1/6 of LP fee) on OP/Arb/Base; 0 on mainnet.',
    [LBL_CLASSIC]: '100% of the 2 bps taker fee.',
  },
  SupplySideRevenue: {
    [LBL_AQUILA]:  '~25 bps on OP/Arb/Base; 30 bps on mainnet (fee switch off).',
    [LBL_CLMM]:    '100% of per-pool fee tier.',
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  // Per-chain start = earliest verified Rubicon deployment on that chain
  // (Blockscout getcontractcreation + eth_getBlockByNumber, checked 2026-07-09):
  //   ethereum 2024-03-04 — Gladius v1 reactor deploy blk 19361393 @ 1709550431
  //            (tx 0x903dd3a1...daa366; first Fill 2024-07-28). The live
  //            adapter's '2023-04-24' predates the earliest ETH contract by
  //            ~10.5 months and is provably wrong.
  //   optimism 2021-11-11 — Classic RubiconMarket code present at the OP
  //            regenesis genesis (blk 1 @ 1636665399); first trade 2021-11-12
  //            (LogTake blk 24606 @ 1636739833).
  //   arbitrum 2023-06-09 — Classic deploy blk 99504898 @ 1686345156
  //            (first offer 2023-06-21).
  //   base     2023-08-08 — Classic deploy blk 2369614 @ 1691528575
  //            (first offer 2023-08-09).
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-03-04' },
    [CHAIN.OPTIMISM]: { start: '2021-11-11' },
    [CHAIN.ARBITRUM]: { start: '2023-06-09' },
    [CHAIN.BASE]:     { start: '2023-08-08' },
  },
}

export default adapter
