import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'
import { addTokensReceived } from '../helpers/token'

// Denaria (https://denaria.finance) is a mobile-first perp trading app settling on
// GMX V2 (Arbitrum One). Denaria's own vAMM engine (Linea, sunset 2026-09-03) is the
// separate `denaria` listing; this adapter covers only the GMX V2 integration.
//
// Attribution: every order created by the Denaria app carries Denaria's
// `uiFeeReceiver`, and GMX echoes it in the `PositionFeesCollected` event of each
// executed increase/decrease, so Denaria-originated volume is the subset of GMX V2
// executions tagged with that receiver.
//
// Liquidations and ADL are the exception: GMX keepers create those orders with a
// zero uiFeeReceiver, but the position still carries the trader's referral code and
// Denaria sets its own code (DENARIA) on every position it opens. A keeper-executed
// decrease with the DENARIA code is a Denaria position being closed, and its
// notional is counted like GMX itself counts it in marginVolumeUsd.
//
// Fees are only Denaria's own take (UI fee, affiliate rewards, app service fee).
// GMX position, borrowing and liquidation fees paid by Denaria traders are counted
// under GMX V2 Perps and are not repeated here.
//
// GMX V2 EventEmitter (Arbitrum One):
// https://arbiscan.io/address/0xC8ee91A54287DB53897056e12D9819156D3822Fb
const EVENT_EMITTER = '0xC8ee91A54287DB53897056e12D9819156D3822Fb'

// keccak256 of the EventLog1 signature and of the indexed eventName string.
const EVENT_LOG_1_TOPIC = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160'
const POSITION_FEES_COLLECTED_TOPIC = '0xe096982abd597114bdaa4a60612f87fabfcc7206aa12d61c50e7ba1e6c291100'

// Denaria production identity on Arbitrum One. The mainnet-staging receiver and
// its `denatest` referral code are different addresses and are deliberately excluded
// (internal team trades).
const DENARIA_UI_FEE_RECEIVER = '0x191933dfd97040a305e70fd0409cbb3bd716505f'
// bytes32("DENARIA"), registered on GMX ReferralStorage
// (https://arbiscan.io/address/0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d) and owned
// by the uiFeeReceiver wallet above.
const DENARIA_REFERRAL_CODE = '0x44454e4152494100000000000000000000000000000000000000000000000000'
// Gnosis Safe receiving the flat per-operation service fee (0.1 USDC per GMX
// operation, 0.05 USDC before) that the Denaria app charges from the user's smart
// account. https://arbiscan.io/address/0xf723f3f37f4a0639ce8daa681ab1762d2ddad485
const DENARIA_SERVICE_FEE_RECEIVER = '0xf723f3f37f4a0639ce8daa681ab1762d2ddad485'

const EVENT_LOG_1_ABI = 'event EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, tuple(tuple(tuple(string key, address value)[] items, tuple(string key, address[] value)[] arrayItems) addressItems, tuple(tuple(string key, uint256 value)[] items, tuple(string key, uint256[] value)[] arrayItems) uintItems, tuple(tuple(string key, int256 value)[] items, tuple(string key, int256[] value)[] arrayItems) intItems, tuple(tuple(string key, bool value)[] items, tuple(string key, bool[] value)[] arrayItems) boolItems, tuple(tuple(string key, bytes32 value)[] items, tuple(string key, bytes32[] value)[] arrayItems) bytes32Items, tuple(tuple(string key, bytes value)[] items, tuple(string key, bytes[] value)[] arrayItems) bytesItems, tuple(tuple(string key, string value)[] items, tuple(string key, string[] value)[] arrayItems) stringItems) eventData)'

const UI_FEES = 'UI Fees'
const AFFILIATE_REWARDS = 'Affiliate Rewards'
const SERVICE_FEES = 'Service Fees'
const VOLUME_LABEL = 'Perpetual Trading Volume'

type KeyValue = { key?: string; value?: any; 0?: string; 1?: any }

function toRecord(items: KeyValue[]): Record<string, any> {
  return Object.fromEntries(items.map((item) => [item.key ?? item[0], item.value ?? item[1]]))
}

function uint(record: Record<string, any>, key: string): bigint {
  const item = record[key]
  return item == null ? 0n : BigInt(item.toString())
}

// GMX V2 USD values are 30-decimal fixed point; keep 6 decimals of USD precision.
function usd30(amount: bigint): number {
  return Number(amount / 10n ** 24n) / 1e6
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()

  // GMX emits every protocol event through the EventEmitter; the event-name topic
  // isolates PositionFeesCollected. uiFeeReceiver is NOT indexed, so the receiver
  // filter has to run on the decoded payload.
  const logs = await options.getLogs({
    targets: [EVENT_EMITTER],
    topics: [EVENT_LOG_1_TOPIC, POSITION_FEES_COLLECTED_TOPIC],
    eventAbi: EVENT_LOG_1_ABI,
  })

  for (const log of logs) {
    const eventData = log.eventData ?? log[4]
    const addresses = toRecord(eventData.addressItems.items)
    const uints = toRecord(eventData.uintItems.items)
    const bytes32s = toRecord(eventData.bytes32Items.items)

    const uiFeeReceiver = String(addresses.uiFeeReceiver ?? '').toLowerCase()
    const referralCode = String(bytes32s.referralCode ?? '').toLowerCase()
    const isDenariaOrder = uiFeeReceiver === DENARIA_UI_FEE_RECEIVER
    const isDenariaReferral = referralCode === DENARIA_REFERRAL_CODE
    if (!isDenariaOrder && !isDenariaReferral) continue

    const collateralToken: string = addresses.collateralToken
    // Liquidation / ADL executed by a GMX keeper on a Denaria position.
    const isKeeperOrder = uiFeeReceiver === ADDRESSES.null

    if (isDenariaOrder || (isDenariaReferral && isKeeperOrder)) {
      // Notional of the executed increase/decrease, liquidations included.
      dailyVolume.addUSDValue(usd30(uint(uints, 'tradeSizeUsd')), VOLUME_LABEL)
    }

    if (isDenariaOrder) {
      // uiFeeFactor x trade size, paid by the trader on top of GMX fees.
      const uiFee = uint(uints, 'uiFeeAmount')
      if (uiFee > 0n) {
        dailyFees.add(collateralToken, uiFee.toString(), UI_FEES)
        dailyUserFees.add(collateralToken, uiFee.toString(), UI_FEES)
      }
    }

    if (isDenariaReferral) {
      // Affiliate share of the GMX position fee, paid to the DENARIA code owner.
      // It is a rebate out of a fee the trader pays to GMX, not an extra user charge.
      const affiliateReward = uint(uints, 'referral.affiliateRewardAmount')
      if (affiliateReward > 0n) dailyFees.add(collateralToken, affiliateReward.toString(), AFFILIATE_REWARDS)
    }
  }

  // Flat service fee: USDC transferred by user smart accounts to the Denaria fee
  // Safe. The Safe has no other inflows (verified on-chain: only per-operation fee
  // amounts, never from Denaria's own wallets).
  const serviceFees = await addTokensReceived({
    options,
    token: ADDRESSES.arbitrum.USDC_CIRCLE, // native USDC (0xaf88...), the token the app charges the fee in
    target: DENARIA_SERVICE_FEE_RECEIVER,
  })
  dailyFees.addBalances(serviceFees, SERVICE_FEES)
  dailyUserFees.addBalances(serviceFees, SERVICE_FEES)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
    // Denaria keeps everything it collects and has no token.
    dailySupplySideRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Volume: 'Notional USD size of every GMX V2 position increase or decrease on a Denaria position, from the PositionFeesCollected event: orders placed through Denaria (identified by the Denaria uiFeeReceiver) plus liquidations and ADL executed by GMX keepers on positions carrying the DENARIA referral code. Same basis as GMX V2 marginVolumeUsd; this volume is also counted by GMX V2 Perps.',
  Fees: 'Fees collected by Denaria: the GMX UI fee charged on Denaria orders, the affiliate reward earned by the DENARIA referral code on GMX position fees, and the flat per-operation service fee paid to the Denaria fee wallet. GMX position, borrowing and funding fees are not Denaria fees and are counted under GMX V2 Perps.',
  UserFees: 'Fees paid directly by Denaria users to Denaria: the GMX UI fee and the flat service fee. Affiliate rewards are excluded because they are a rebate out of the fee the trader pays to GMX.',
  Revenue: 'All Denaria fees are revenue.',
  ProtocolRevenue: 'All revenue accrues to the Denaria fee wallets.',
  SupplySideRevenue: 'None: Denaria has no liquidity providers of its own on GMX.',
  HoldersRevenue: 'None: Denaria has no token.',
}

const breakdownMethodology = {
  Volume: {
    [VOLUME_LABEL]: 'Executed position size of Denaria-originated GMX V2 orders, including keeper liquidations and ADL of Denaria positions.',
  },
  Fees: {
    [UI_FEES]: 'GMX uiFee (uiFeeFactor x trade size) paid by Denaria traders to the Denaria uiFeeReceiver.',
    [AFFILIATE_REWARDS]: 'Affiliate share of GMX position fees paid to the owner of the DENARIA referral code.',
    [SERVICE_FEES]: 'Flat per-operation USDC service fee charged by the Denaria app (GMX operations and wallet transfers), received by the Denaria fee Safe.',
  },
  UserFees: {
    [UI_FEES]: 'GMX uiFee paid by Denaria traders.',
    [SERVICE_FEES]: 'Flat per-operation USDC service fee paid by Denaria users.',
  },
  Revenue: {
    [UI_FEES]: 'GMX uiFee paid to the Denaria uiFeeReceiver.',
    [AFFILIATE_REWARDS]: 'Affiliate rewards paid to the DENARIA referral code owner.',
    [SERVICE_FEES]: 'Service fees received by the Denaria fee Safe.',
  },
  ProtocolRevenue: {
    [UI_FEES]: 'GMX uiFee paid to the Denaria uiFeeReceiver.',
    [AFFILIATE_REWARDS]: 'Affiliate rewards paid to the DENARIA referral code owner.',
    [SERVICE_FEES]: 'Service fees received by the Denaria fee Safe.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // settles on GMX V2, whose Arbitrum volume and fees are already tracked
  chains: [CHAIN.ARBITRUM],
  start: '2026-09-01', // first executed Denaria trade on GMX: 2026-09-02 10:40 UTC (block 500951478); start one day earlier so the first day's hourly windows are not skipped by the runner
  fetch,
  methodology,
  breakdownMethodology,
}

export default adapter
