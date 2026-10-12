import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

// LendingLens is CREATE2-deterministic at the same address on Sonic and
// Ethereum. Verified via deployment manifests at
// https://flyingtulipdotcom.github.io/deployments/prod-{sonic,eth}-ftdnmm-lend.toon
// BNB Smart Chain has its own deployment.
const LENDING_LENS: Record<string, string> = {
  [CHAIN.SONIC]: '0x3682168023e6ba8d1f995fda1d920827c5a8a43e',
  [CHAIN.ETHEREUM]: '0x3682168023e6ba8d1f995fda1d920827c5a8a43e',
  [CHAIN.BSC]: '0xc374d2ae274f31bf53c561d0b4024136cc692f48',
}

// LeverageRfqEngine (v1 and the current v2) and RfqEngine. All forward fees to
// the Flying Tulip treasury (0x1118e1c057211306a40A4d7006C040dbfE1370Cb) via
// feeCollector / liqFeeCollector. Most fills now go through v2.
const LEVERAGE_RFQ_ENGINES: Record<string, string[]> = {
  [CHAIN.SONIC]: ['0x8263a07504d93cb95e0a74f3627bb15faaf140e2', '0x93496075909f56d93b33302df5d1655568eb6e70'],
  [CHAIN.ETHEREUM]: ['0x8263a07504d93cb95e0a74f3627bb15faaf140e2', '0x93496075909f56d93b33302df5d1655568eb6e70'],
  [CHAIN.BSC]: ['0x01916c31def593cd94d707724facdf7add121bf1'],
}
const RFQ_ENGINES: Record<string, string[]> = {
  [CHAIN.SONIC]: ['0xeb00b335ca52216fb60fdffa361397367c39dc32', '0xc64516d58f8b83bc256448bc69d7bf2361557fdb'],
  [CHAIN.ETHEREUM]: ['0xeb00b335ca52216fb60fdffa361397367c39dc32', '0xc64516d58f8b83bc256448bc69d7bf2361557fdb'],
  [CHAIN.BSC]: ['0xa0dbd53aeec3f5acd16c69c3001114ee51813e58'],
}

// Reserves are maintained off chain. Flying Tulip's LendingLens does not expose
// a public enumeration method (no getReserves / allAssets / reservesList). The
// authoritative list lives in Flying Tulip's backend config and is mirrored by
// the public API. To refresh either list, call:
//     curl https://api.flyingtulip.com/mm/lend?chainId=146 | jq '.data.chains[0].assets[].address'
//     curl https://api.flyingtulip.com/mm/lend?chainId=1   | jq '.data.chains[0].assets[].address'
//     curl https://api.flyingtulip.com/mm/lend?chainId=56  | jq '.data.chains[0].assets[].address'
const RESERVES: Record<string, string[]> = {
  [CHAIN.SONIC]: [
    ADDRESSES.sonic.USDC_e, // USDC
    ADDRESSES.sonic.wS, // wS
    '0x5dd1a7a369e8273371d2dbf9d83356057088082c', // FT (address LendingLens is configured to key on)
    ADDRESSES.sonic.STS, // stS
    '0xf7d85ec4e7710f71992752eac2111312e73e9c9c', // ftUSD
    '0x50c42deacd8fc9773493ed674b675be577f2634b', // WETH
    ADDRESSES.sonic.WBTC, // WBTC
    '0x000000000eccff26b795f73fb0a70d48da657fef', // USSD
  ],
  [CHAIN.ETHEREUM]: [
    ADDRESSES.ethereum.USDC, // USDC
    ADDRESSES.ethereum.USDT, // USDT
    ADDRESSES.ethereum.WETH, // WETH
    ADDRESSES.ethereum.WBTC, // WBTC
    '0x5dd1a7a369e8273371d2dbf9d83356057088082c', // FT
    '0xf7d85ec4e7710f71992752eac2111312e73e9c9c', // ftUSD (CREATE2 same address as Sonic)
    ADDRESSES.ethereum.WSTETH, // wstETH
    '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e', // crvUSD
    ADDRESSES.ethereum.USDe, // USDe
    '0x0655977feb2f289a4ab78af67bab0d17aab84367', // scrvUSD
    ADDRESSES.ethereum.USDG, // USDG
    ADDRESSES.ethereum.sUSDe, // sUSDe
  ],
  [CHAIN.BSC]: [
    ADDRESSES.bsc.USDC, // USDC
    ADDRESSES.bsc.USDT, // USDT
    ADDRESSES.bsc.WBNB, // WBNB
    ADDRESSES.bsc.FDUSD, // FDUSD
    '0x77734e70b6e88b4d82fe632a168edf6e700912b6', // asBNB
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // ETH
    ADDRESSES.bsc.BTCB, // BTCB
    '0xa2e3356610840701bdf5611a53974510ae27e2e1', // wBETH
    '0x205812cdbed920aff76c6580abd681a46d11efc7', // QQQB
  ],
}

const ASSET_STATE_ABI =
  'function assetState(address) view returns (uint256 cash, uint256 borrows, uint256 reserves, uint256 utilWad)'
const ASSET_CFG_ABI =
  'function assetCfg(address) view returns (address irm, uint16 mmBps, bool enabled, bool borrowable, bool isCollateral)'
const IRM_SAMPLE_APR_ABI =
  'function irmSampleAPR(address, uint256[]) view returns (uint256[])'

// Trading-engine events. All carry the fee in `feeAmount`, denominated in the
// `sellToken` for leverage events and in `asset` for the RFQ liquidation event.
const OPEN_LEVERAGE_FILLED =
  'event OpenLeverageFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountIn, uint256 buyAmountMin, uint256 feeAmount, bytes32 digest)'
const OPEN_LEVERAGE_FLASH_FILLED =
  'event OpenLeverageFlashFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountMin, uint256 feeAmount, address fillTarget, bytes32 digest)'
const CLOSE_LEVERAGE_FILLED =
  'event CloseLeverageFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountIn, uint256 buyAmountMin, uint256 feeAmount, bytes32 digest)'
const CLOSE_LEVERAGE_FLASH_FILLED =
  'event CloseLeverageFlashFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountMin, uint256 feeAmount, address fillTarget, bytes32 digest)'
const COLLATERAL_SWAP_FLASH_FILLED =
  'event CollateralSwapFlashFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountMin, uint256 feeAmount, address fillTarget, bytes32 digest)'
const COLLATERAL_SWAP_FILLED =
  'event CollateralSwapFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountIn, uint256 buyAmountMin, uint256 feeAmount, bytes32 digest)'
const LIQUIDATION_FEE_COLLECTED =
  'event LiquidationFeeCollected(address indexed asset, address indexed to, uint256 amount)'

const WAD = 10n ** 18n
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n
const ZERO_ADDRESS = ADDRESSES.null

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  const reserves = RESERVES[options.chain] || []

  const [states, cfgs] = await Promise.all([
    options.toApi.multiCall({
      target: LENDING_LENS[options.chain],
      abi: ASSET_STATE_ABI,
      calls: reserves,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      target: LENDING_LENS[options.chain],
      abi: ASSET_CFG_ABI,
      calls: reserves,
      permitFailure: true,
    }),
  ])

  const windowSeconds = BigInt(options.endTimestamp - options.startTimestamp)

  const aprCalls: { target: string; params: any[] }[] = []
  const aprIndex: number[] = []
  for (let i = 0; i < reserves.length; i++) {
    const state = states[i]
    const cfg = cfgs[i]
    if (!state || !cfg) continue
    const irm = cfg[0]
    if (!irm || irm.toLowerCase() === ZERO_ADDRESS) continue
    const borrows = BigInt(state[1])
    if (borrows === 0n) continue
    aprCalls.push({ target: LENDING_LENS[options.chain], params: [irm, [state[3].toString()]] })
    aprIndex.push(i)
  }

  const aprResults = await options.toApi.multiCall({
    abi: IRM_SAMPLE_APR_ABI,
    calls: aprCalls,
    permitFailure: true,
  })

  for (let k = 0; k < aprIndex.length; k++) {
    const i = aprIndex[k]
    const aprs = aprResults[k]
    if (!aprs || aprs.length === 0 || !aprs[0]) continue;
    const borrows = BigInt(states[i][1])
    const aprWad = BigInt(aprs[0])
    const interest = (borrows * aprWad * windowSeconds) / (WAD * SECONDS_PER_YEAR)
    if (interest <= 0n) continue
    dailyFees.add(reserves[i], interest, 'Borrow Interest')
    dailySupplySideRevenue.add(reserves[i], interest, 'Borrow Interest To Lenders')
  }

  // 2) LeverageRfqEngine trading fees — protocol revenue (sent to feeCollector
  //    which is the Flying Tulip treasury).
  const leverageEvents: [string, string][] = [
    [OPEN_LEVERAGE_FILLED, 'Open Leverage Fee'],
    [OPEN_LEVERAGE_FLASH_FILLED, 'Open Leverage Fee'],
    [CLOSE_LEVERAGE_FILLED, 'Close Leverage Fee'],
    [CLOSE_LEVERAGE_FLASH_FILLED, 'Close Leverage Fee'],
    [COLLATERAL_SWAP_FILLED, 'Collateral Swap Fee'],
    [COLLATERAL_SWAP_FLASH_FILLED, 'Collateral Swap Fee'],
  ]
  for (const [eventAbi, label] of leverageEvents) {
    const logs: any[] = await options.getLogs({ targets: LEVERAGE_RFQ_ENGINES[options.chain], eventAbi })
    for (const log of logs) {
      const fee = BigInt(log.feeAmount.toString())
      if (fee === 0n) continue
      const token = (log.sellToken as string).toLowerCase()
      dailyFees.add(token, fee, label)
      dailyRevenue.add(token, fee, label)
      dailyProtocolRevenue.add(token, fee, label)
    }
  }

  // 3) RfqEngine liquidation fees — protocol revenue (to liqFeeCollector = treasury).
  const liqLogs: any[] = await options.getLogs({ targets: RFQ_ENGINES[options.chain], eventAbi: LIQUIDATION_FEE_COLLECTED })
  for (const log of liqLogs) {
    const amount = BigInt(log.amount.toString())
    if (amount === 0n) continue
    const asset = (log.asset as string).toLowerCase()
    dailyFees.add(asset, amount, 'RFQ Liquidation Fee')
    dailyRevenue.add(asset, amount, 'RFQ Liquidation Fee')
    dailyProtocolRevenue.add(asset, amount, 'RFQ Liquidation Fee')
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees:
    'Sum of (a) borrower interest accrued across every Lend reserve, (b) leverage trading fees from LeverageRfqEngine open/close/collateral-swap events, and (c) RFQ liquidation fees from RfqEngine.',
  Revenue:
    'Leverage trading fees and RFQ liquidation fees flow to the Flying Tulip treasury via feeCollector and liqFeeCollector. Borrower interest does not retain a protocol cut on chain.',
  ProtocolRevenue:
    'Same as Revenue. Leverage and liquidation fees both end up at 0x1118e1c057211306a40A4d7006C040dbfE1370Cb (treasury).',
  SupplySideRevenue:
    'Borrower interest only. The on chain reserves accumulator collects interest, the protocol then swaps it to FT on the open market via LendEpochSettlerOperator and distributes the FT back to lenders pro rata via PositionsManager.settleEpoch. FT has a fixed total supply so nothing is minted.',
}

const breakdownMethodology = {
  Fees: {
    'Borrow Interest':
      'Interest paid by borrowers across every reserve, estimated as borrows * IRM.irmSampleAPR(util) * windowSeconds / year.',
    'Open Leverage Fee':
      'feeAmount field of LeverageRfqEngine.OpenLeverageFilled and OpenLeverageFlashFilled events, denominated in the trade sellToken.',
    'Close Leverage Fee':
      'feeAmount field of LeverageRfqEngine.CloseLeverageFilled and CloseLeverageFlashFilled events.',
    'Collateral Swap Fee':
      'feeAmount field of LeverageRfqEngine.CollateralSwapFilled and CollateralSwapFlashFilled events.',
    'RFQ Liquidation Fee':
      'amount field of RfqEngine.LiquidationFeeCollected events, denominated in the asset being liquidated.',
  },
  Revenue: {
    'Open Leverage Fee': 'Open-leverage fees retained by the protocol via feeCollector (Flying Tulip treasury).',
    'Close Leverage Fee': 'Close-leverage fees retained by the protocol via feeCollector.',
    'Collateral Swap Fee': 'Collateral-swap fees retained by the protocol via feeCollector.',
    'RFQ Liquidation Fee': 'Liquidation fees retained by the protocol via liqFeeCollector (treasury).',
  },
  ProtocolRevenue: {
    'Open Leverage Fee': 'Open-leverage fees collected by LeverageRfqEngine, sent to feeCollector (Flying Tulip treasury).',
    'Close Leverage Fee': 'Close-leverage fees collected by LeverageRfqEngine, sent to feeCollector.',
    'Collateral Swap Fee': 'Collateral-swap fees collected by LeverageRfqEngine, sent to feeCollector.',
    'RFQ Liquidation Fee': 'Liquidation fees collected by RfqEngine, sent to liqFeeCollector (treasury).',
  },
  SupplySideRevenue: {
    'Borrow Interest To Lenders':
      'Total borrower interest accrues to the on chain reserves accumulator; the protocol then buys FT on the open market and distributes it to lenders pro rata via PositionsManager.settleEpoch.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2026-03-23',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2026-05-01',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2026-09-14',
    },
  },
}

export default adapter
