import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";

// ---------------------------------------------------------------------------
// Rubicon — daily fees and revenue across four systems on four chains.
//
//   Aquila V2 — 30 bps LP fee; 1/6 to protocol (~5 bps) on OP/Arb/Base; OFF
//               on mainnet (factory.feeTo() == 0x0, re-verified 2026-07-09).
//   CLMM V3   — per-pool tier (500/3000/10000 bps). factory.setFeeProtocol
//               not enabled on any Rubicon pool → 100% to LPs (UniV3 default).
//   Classic   — getFeeBPS() == 2 (0.02% taker). No LP layer → 100% protocol.
//   Gladius   — UniswapX-fork per-order fee outputs to the canonical Rubicon
//               fee EOA. Captured via inflow at 0x7527…ef14 restricted to
//               senders that filled a Gladius order today (cleanly excludes
//               Aquila LP-redemption flow, which originates from LP holders
//               rather than from active Gladius fillers).
//
// Fields produced:
//   dailyFees              total user-paid trading fees (LP + protocol)
//   dailyUserFees          == dailyFees
//   dailyRevenue           protocol cut
//   dailyProtocolRevenue   == dailyRevenue (no holders/buyback bucket today)
//   dailySupplySideRevenue LP cut (== dailyFees − dailyRevenue)
//
// Per-system contributions are tagged via the SDK's
// `balance.addBalances(_, label)` so DefiLlama renders Aquila / CLMM /
// Classic / Gladius as separate breakdown series.
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

// Pregenesis pool fallback — kept in lockstep with dexs/rubicon/index.ts.
// Snapshot regenerated 2026-07-09 from live PoolCreated logs (complete:
// ETH 10, OP 9, Arb 15, Base 23 pools). Ensures CLMM fees are still reported
// when the factory-based PoolCreated log path comes back empty.
const CLMM_PREGENESIS_POOLS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ['0x028ab215a083f85233965b2c227d7246a1485a93','0x12f6541d6415d9709af49665005d7e5efa89cef7','0x2449aadcc68182dc40cd9d9e2a14957ecafe8ea6','0x6000ee55d968ab528b56349a6b70bbd4d03ccd93','0x61c611769e2630983a8ea3dce9d90f24ab7a7fb6','0x9737b4f2559f795fc137d270b28f6667d25ee65e','0xaceea35546823865cc92618d7233886fa0325a85','0xb51e9bd9083d66dd479e441fa847fb0c703d0424','0xdbb54a50ea089cf7d4f91a4cec707c4d104e7704','0xe7c40cfaab7ea4084a34a89387265db9d5611a89'],
  [CHAIN.OPTIMISM]: ['0x192fc958e74569cf98117c8690bf6de6fbf686fd','0x40c20c5ef2d863e4a06a3ec59a8fb86f99bb1928','0x7760b1b80fbb770d15aa54c3eaa54e5ca97740d0','0x7afb406e277e2c8d3837400667ef0617d8c23692','0x8d046c46412a8afbf612ed046938e9858491ecbc','0x9b07854f79f2e178c9e81471b59fa4e6ddf5e617','0xad651a1d4ef32596fc5fb9eff30eafdd4187248c','0xaebbf83f3d56e201b806b5537ecd7863b14d32fc','0xedb836009053955cf31dd79d84ef8fced9293d65'],
  [CHAIN.ARBITRUM]: ['0x17191d9c1d0b42d2ff967baa043b604d56f54b4e','0x1dd95f3c2ca1e01b9ecf81453a03187c7bd954d5','0x31168cfc7ffe206ba651224b017170953c2ee1b8','0x388930a1893167a93476dfe8a07f3615d97db7c5','0x5ea431fad22e75d62e7d74745c23d12f2e1b0161','0xa1dc8490257633abc8599471a2a0707a2f6ba5d5','0xbd10851ad216785913eedfd845042ca684b0a9e4','0xbf1df812ee0e85644b6dc20e5214c6521482e0b6','0xc1c4f5313bc9f6947573e0fa3279b3f651694c76','0xc4f308b39411da159367ea3284af51ce1ad05e0e','0xc68b7d9ea68e5d4763e620c3aa0e940808baa236','0xd2806623e11021b7aa589b8bc75c615b2fda7b62','0xe9a76612370ec2c3f20c2c96800a4ad7f0839e51','0xee57310555a957cec1debb65b1e165d7c9ed700f','0xee9f158cf74059b1df239ac3d365dc7ead006233'],
  [CHAIN.BASE]:     ['0x002ce7bb4c5d130ed79c908217ae565f537148cf','0x0ba8ffab522342bd76f094d48415a850dcf976bf','0x1d265c8c84cf21ee435e067588bdbdea514110a4','0x2dca4ce76d38d2c14486932d0a07ec594f447f26','0x2e95713f63b93a5934034d462169f1f0c4b3a712','0x47e66a90e38d080cec076d1aef184673ea1b1f07','0x52430b5c47fb4fc6b336d45ee3aaabfbab39bdee','0x554644e713252401e6b5b18c9db17f4dd21ed5b5','0x56bce4571a7d13975a5f3d2f2262467f28fd5d6e','0x58f0d527ce2696693e4bf5da1242c92ae647eeea','0x604721a075977a3311f53ea72229a54913b43280','0x66b2a16b47ab18d339ca60bcb1e6f6cb7b9ff134','0x6eeabe5038ef192d615d743b8bd67368749a95d5','0x8a85cc9cfa7ca03e2a5a27211d71322759f76c1f','0x8bab7c87120bc87dbf8d2b0a0fd6a17ba40294e1','0x902e988a0ebf2642504aba2889e98b6ee4b5a6a7','0x9dbea192ed73543c04318f8868df09c0427fd016','0xa505d8c28443fd56accd8675c5a5809adcf5ff0f','0xa606d0bd0d1547faa740e2cee62a2dfa58de62d1','0xe91a58e346968c3405775d046e960201f7253378','0xf34c8ac1ff95dbf4410881ee676c00e4eca65b42','0xff37be987ad92c7103a9551bc5bd204828d243d7','0xffcc108fe7e6d21e4944ac5acd976755c53bf8a7'],
}

const CLASSIC_MARKET: Record<string, string> = {
  [CHAIN.OPTIMISM]: '0x7a512d3609211e719737E82c7bb7271eC05Da70d',
  [CHAIN.ARBITRUM]: '0xC715a30FDe987637A082Cf5F19C74648b67f2db8',
  [CHAIN.BASE]:     '0x9A5215E96E1185d4e6002C95C3Cc0aB6eEaD354F',
}

// TWO take-event families — kept in lockstep with dexs/rubicon/index.ts:
// v1 LogTake fired on Optimism only until the 2023-05-25 v2 upgrade; emitTake
// (v2) is what all three chains emit today — Arb/Base have NEVER emitted
// LogTake (zero-result lifetime topic0 queries, verified 2026-07-09).
const CLASSIC_LOGTAKE_ABI =
  'event LogTake(bytes32 id, bytes32 indexed pair, address indexed maker, address pay_gem, address buy_gem, address indexed taker, uint128 take_amt, uint128 give_amt, uint64 timestamp)'
const CLASSIC_EMITTAKE_ABI =
  'event emitTake(bytes32 indexed id, bytes32 indexed pair, address indexed maker, address taker, address pay_gem, address buy_gem, uint128 take_amt, uint128 give_amt)'

// Aquila protocol-fee switch state — verified via factory.feeTo() probe
// (re-verified 2026-07-09). 0 means protocol fee OFF on that chain → all
// 30 bps stays with LPs. NOTE: Base's feeTo is an upgradeable-proxy fee
// contract that ACCRUES Aquila LP tokens (fee-share mints) and has never
// forwarded anything on; revenue accounting here is volume-derived, so this
// only matters for wallet-inflow-based cross-checks.
const AQUILA_REVENUE_RATIO: Record<string, number> = {
  [CHAIN.ETHEREUM]: 0,         // feeTo == 0x0 — currently OFF on mainnet
  [CHAIN.OPTIMISM]: 1 / 6,     // feeTo == 0x7527…ef14
  [CHAIN.ARBITRUM]: 1 / 6,     // feeTo == 0x7527…ef14
  [CHAIN.BASE]:     1 / 6,     // feeTo == 0x1db5…9cba (proxy; accrues LP tokens, no onward forwarding to date)
}

// Canonical Rubicon protocol fee EOA — same address on all four chains
// (nonces 0/97/3/25 on ETH/OP/Arb/Base, verified). Receives Gladius RFQ fee
// outputs.
const RUBICON_FEE_WALLET = '0x752748deaf25cf58b60d4c4209d7f200aee4ef14'

const GLADIUS_REACTORS: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: ['0x6d81571b4c75ccf08bd16032d0ae54dbaff548b0'],
  [CHAIN.BASE]:     ['0x3c53c04d633bec3fb0de3492607c239bf92d07f9'],
  [CHAIN.ETHEREUM]: ['0x3C53c04d633bec3fB0De3492607C239BF92d07f9', '0xF08DB8D79312ce610aEED9463EdE1A6BB8aE4235'],
  [CHAIN.OPTIMISM]: ['0xcb23e6c82c900e68d6f761bd5a193a5151a1d6d2', '0x98169248bdf25e0e297ea478ab46ac24058fac78', '0x95b7F3662Ba73b3fF35874Af0E09b050dB03118B'],
}

const GLADIUS_FILL_ABI =
  'event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)'

const CLASSIC_FEE_BPS = 2
const CLASSIC_FEE_RATE = CLASSIC_FEE_BPS / 10_000 // 0.0002

const LBL_AQUILA  = 'Aquila V2'
const LBL_CLMM    = 'CLMM V3'
const LBL_CLASSIC = 'Classic'
const LBL_GLADIUS = 'Gladius'

const fetch = async (options: FetchOptions) => {
  const chain = options.chain
  const dailyFees              = options.createBalances()
  const dailyRevenue           = options.createBalances()
  const dailyProtocolRevenue   = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // === Aquila V2 — vol-derived fees & revenue ============================
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
    if (aq?.dailyFees)              dailyFees.addBalances(aq.dailyFees, LBL_AQUILA)
    if (aq?.dailyRevenue)           dailyRevenue.addBalances(aq.dailyRevenue, LBL_AQUILA)
    if (aq?.dailyProtocolRevenue)   dailyProtocolRevenue.addBalances(aq.dailyProtocolRevenue, LBL_AQUILA)
    if (aq?.dailySupplySideRevenue) dailySupplySideRevenue.addBalances(aq.dailySupplySideRevenue, LBL_AQUILA)
  }

  // === CLMM V3 — vol-derived; 100% to LPs ================================
  // Factory-first, then pregenesis pool list fallback (see dexs/rubicon for
  // the rationale).
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
    if (cl?.dailyFees)              dailyFees.addBalances(cl.dailyFees, LBL_CLMM)
    if (cl?.dailySupplySideRevenue) dailySupplySideRevenue.addBalances(cl.dailySupplySideRevenue, LBL_CLMM)
  }

  // === Classic — 2 bps taker, 100% protocol revenue ======================
  // Both event families scanned; at most one fires per chain per day.
  if (CLASSIC_MARKET[chain]) {
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
    const classicFees = options.createBalances()
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: classicFees, token0: log.pay_gem, token1: log.buy_gem, amount0: Number(log.take_amt) * CLASSIC_FEE_RATE, amount1: Number(log.give_amt) * CLASSIC_FEE_RATE })
    })
    dailyFees.addBalances(classicFees, LBL_CLASSIC)
    dailyRevenue.addBalances(classicFees, LBL_CLASSIC)
    dailyProtocolRevenue.addBalances(classicFees, LBL_CLASSIC)
  }

  // === Gladius — fee-wallet inflow restricted to active fillers ==========
  // First scan today's Fill events to discover the active filler set, then
  // sum only token transfers from those fillers into the canonical fee EOA.
  // This isolates Gladius RFQ fee outputs from any unrelated treasury flow
  // (e.g. Aquila LP redemption) that happens to credit the same address.
  if (GLADIUS_REACTORS[chain]) {
    const fills = await options.getLogs({
      targets: GLADIUS_REACTORS[chain],
      eventAbi: GLADIUS_FILL_ABI,
    })
    const fillers = Array.from(new Set<string>(fills.map((f: any) => String(f.filler).toLowerCase())))
    if (fillers.length > 0) {
      const gladiusFees = await addTokensReceived({
        options,
        target: RUBICON_FEE_WALLET,
        fromAdddesses: fillers,
      })
      if (gladiusFees) {
        dailyFees.addBalances(gladiusFees, LBL_GLADIUS)
        dailyRevenue.addBalances(gladiusFees, LBL_GLADIUS)
        dailyProtocolRevenue.addBalances(gladiusFees, LBL_GLADIUS)
      }
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  UserFees:
    'Identical to Fees — every fee is paid by the trader/taker; there are no ' +
    'protocol-side fee sources beyond trading.',
  Fees:
    'Sum across four Rubicon trading systems: Aquila V2 charges 30 bps LP fee on every ' +
    'swap; CLMM V3 charges the per-pool tier (500/3000/10000 bps); Classic charges ' +
    'getFeeBPS() = 2 bps to takers on RubiconMarket; Gladius (RFQ) fees are token inflows ' +
    'to the Rubicon fee wallet (0x7527…ef14) restricted to today\'s Gladius fillers, so ' +
    'unrelated treasury flows (e.g. Aquila LP redemption) are excluded.',
  Revenue:
    'Protocol cut: Aquila V2 1/6 of LP fee (~5 bps) on OP/Arb/Base (verified ' +
    'factory.feeTo != 0); CLMM V3 zero by default (factory.setFeeProtocol not enabled); ' +
    'Classic 100% of the 2 bps taker fee; Gladius via filler-scoped fee-wallet inflow.',
  ProtocolRevenue:
    'Identical to Revenue — Rubicon does not currently route fees to a holders/buyback bucket.',
  SupplySideRevenue:
    'LP cut: dailyFees minus Revenue. Aquila ~25 bps to LPs (OP/Arb/Base) or 30 bps ' +
    '(mainnet, fee switch off). CLMM 100% of pool tier. Classic and Gladius do not have ' +
    'an LP layer.',
}

const breakdownMethodology = {
  Fees: {
    [LBL_AQUILA]:  '30 bps × Aquila swap notional, vol-derived.',
    [LBL_CLMM]:    'Per-pool tier × CLMM swap notional, vol-derived.',
    [LBL_CLASSIC]: '2 bps × take-event (LogTake v1 / emitTake v2) notional on RubiconMarket.',
    [LBL_GLADIUS]: 'ERC20 inflow to Rubicon fee wallet 0x7527…ef14 restricted to today\'s Gladius fillers.',
  },
  Revenue: {
    [LBL_AQUILA]:  '1/6 of LP fee (~5 bps) on OP/Arb/Base; 0 on mainnet.',
    [LBL_CLASSIC]: '100% of the 2 bps taker fee.',
    [LBL_GLADIUS]: 'Filler→fee-wallet inflow (Gladius fee outputs).',
  },
  ProtocolRevenue: {
    [LBL_AQUILA]:  '1/6 of LP fee (~5 bps) on OP/Arb/Base; 0 on mainnet.',
    [LBL_CLASSIC]: '100% of the 2 bps taker fee.',
    [LBL_GLADIUS]: 'Filler→fee-wallet inflow (Gladius fee outputs).',
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
  // (Blockscout getcontractcreation + eth_getBlockByNumber, checked 2026-07-09;
  // kept in lockstep with dexs/rubicon/index.ts):
  //   ethereum 2024-03-04 — Gladius v1 reactor deploy blk 19361393 @ 1709550431
  //            (the live adapter's '2023-04-24' predates the earliest ETH
  //            contract by ~10.5 months and is provably wrong)
  //   optimism 2021-11-11 — Classic code present at OP regenesis genesis
  //            (blk 1); first trade 2021-11-12 (LogTake blk 24606)
  //   arbitrum 2023-06-09 — Classic deploy blk 99504898 (first offer 2023-06-21)
  //   base     2023-08-08 — Classic deploy blk 2369614 (first offer 2023-08-09)
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-03-04' },
    [CHAIN.OPTIMISM]: { start: '2021-11-11' },
    [CHAIN.ARBITRUM]: { start: '2023-06-09' },
    [CHAIN.BASE]:     { start: '2023-08-08' },
  },
}

export default adapter
