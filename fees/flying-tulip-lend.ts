import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

const LENDING_LENS = '0x3682168023e6ba8d1f995fda1d920827c5a8a43e'

// LeverageRfqEngine and RfqEngine on Sonic. Both forward fees to the same
// treasury (0x1118e1c057211306a40A4d7006C040dbfE1370Cb) via feeCollector /
// liqFeeCollector.
const LEVERAGE_RFQ_ENGINE = '0x8263a07504d93cB95e0a74f3627bb15faaf140e2'
const RFQ_ENGINE = '0xEB00B335Ca52216Fb60fdFFA361397367C39Dc32'

// Reserves are maintained off chain. Flying Tulip's LendingLens does not expose
// a public enumeration method (no getReserves / allAssets / reservesList). The
// authoritative list lives in Flying Tulip's backend config and is mirrored by
// the public API. To refresh this list, call:
//     curl https://api.flyingtulip.com/mm/lend | jq '.data.chains[0].assets[].address'
// Contract reference: https://sonicscan.org/address/0x3682168023e6ba8d1f995fda1d920827c5a8a43e
const RESERVES: Record<string, string[]> = {
  [CHAIN.SONIC]: [
    '0x29219dd400f2bf60e5a23d13be72b486d4038894', // USDC
    '0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38', // wS
    '0x5dd1a7a369e8273371d2dbf9d83356057088082c', // FT (address LendingLens is configured to key on)
    '0xe5da20f15420ad15de0fa650600afc998bbe3955', // stS
    '0xf7d85ec4e7710f71992752eac2111312e73e9c9c', // ftUSD
    '0x50c42deacd8fc9773493ed674b675be577f2634b', // WETH
    '0x0555e30da8f98308edb960aa94c0db47230d2b9c', // WBTC
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
const COLLATERAL_SWAP_FILLED =
  'event CollateralSwapFilled(address indexed filler, address indexed user, address indexed receiver, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmountIn, uint256 buyAmountMin, uint256 feeAmount, bytes32 digest)'
const LIQUIDATION_FEE_COLLECTED =
  'event LiquidationFeeCollected(address indexed asset, address indexed to, uint256 amount)'

const WAD = 10n ** 18n
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const reserves = RESERVES[options.chain] || []

  // 1) Borrower interest — supply-side revenue, no protocol cut.
  if (reserves.length > 0) {
    const [states, cfgs] = await Promise.all([
      options.toApi.multiCall({
        target: LENDING_LENS,
        abi: ASSET_STATE_ABI,
        calls: reserves,
        permitFailure: true,
      }),
      options.toApi.multiCall({
        target: LENDING_LENS,
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
      aprCalls.push({ target: LENDING_LENS, params: [irm, [state[3].toString()]] })
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
      if (!aprs || aprs.length === 0 || !aprs[0]) continue
      const borrows = BigInt(states[i][1])
      const aprWad = BigInt(aprs[0])
      const interest = (borrows * aprWad * windowSeconds) / (WAD * SECONDS_PER_YEAR)
      if (interest <= 0n) continue
      dailyFees.add(reserves[i], interest, 'Borrow Interest')
      dailySupplySideRevenue.add(reserves[i], interest, 'Borrow Interest To Lenders')
    }
  }

  // 2) LeverageRfqEngine trading fees — protocol revenue (sent to feeCollector
  //    which is the Flying Tulip treasury).
  const leverageEvents: [string, string][] = [
    [OPEN_LEVERAGE_FILLED, 'Open Leverage Fee'],
    [OPEN_LEVERAGE_FLASH_FILLED, 'Open Leverage Fee'],
    [CLOSE_LEVERAGE_FILLED, 'Close Leverage Fee'],
    [CLOSE_LEVERAGE_FLASH_FILLED, 'Close Leverage Fee'],
    [COLLATERAL_SWAP_FILLED, 'Collateral Swap Fee'],
  ]
  for (const [eventAbi, label] of leverageEvents) {
    const logs = await options.getLogs({ target: LEVERAGE_RFQ_ENGINE, eventAbi })
    for (const log of logs) {
      const fee = BigInt(log.feeAmount.toString())
      if (fee === 0n) continue
      const token = (log.sellToken as string).toLowerCase()
      dailyFees.add(token, fee, label)
      dailyRevenue.add(token, fee, label)
      dailyProtocolRevenue.add(token, fee, label)
    }
  }

  // 3) RfqEngine liquidation fees — protocol revenue (to liqFeeCollector =
  //    treasury).
  const liqLogs = await options.getLogs({ target: RFQ_ENGINE, eventAbi: LIQUIDATION_FEE_COLLECTED })
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
      'feeAmount field of LeverageRfqEngine.CollateralSwapFilled events.',
    'RFQ Liquidation Fee':
      'amount field of RfqEngine.LiquidationFeeCollected events, denominated in the asset being liquidated.',
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
  version: 1,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2026-03-23',
    },
  },
}

export default adapter
