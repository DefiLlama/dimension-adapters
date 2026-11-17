import { Balances } from "@defillama/sdk";
import { ethers } from "ethers";
import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type TContract = {
  [s: string | CHAIN]: string[];
}
const contracts: TContract = {
  [CHAIN.ETHEREUM]: ['0x3263bc4976C8c180bd5EB90a57ED1A2f1CFcAC67', '0x7915f087685fffD71608E5d118f3B70c27D9eF4e', "0x131642c019AF815Ae5F9926272A70C84AE5C37ab", "0x1DAe28D7007703196d6f456e810F67C33b51b25C", "0x1FA57f879417e029Ef57D7Ce915b0aA56A507C31"],
  [CHAIN.POLYGON]: ["0x551c6791c2f01c3Cd48CD35291Ac4339F206430d", "0xe63fb3a3cd48df6a336560a91f78ac6013557f7d", "0x7f52269092F2a5EF06C36C91e46F9196deb90336", "0x48073112c8C48e2550Bd42E4CD0aA483a416c5af", "0xc2252Ce3348B8dAf90583E53e07Be53d3aE728FB", "0x288844216a63638381784E0C1081A3826fD5a2E4"],
  [CHAIN.BASE]: ["0xeF0D482Daa16fa86776Bc582Aff3dFce8d9b8396", "0x131642c019AF815Ae5F9926272A70C84AE5C37ab", "0x9Bb4D44e6963260A1850926E8f6bEB8d5803836F", "0x30E95edE0b3C7Ef147EE97A5e88FdE06311EA11f", "0xeADE6bE02d043b3550bE19E960504dbA14A14971", "0x03059433BCdB6144624cC2443159D9445C32b7a8"],
}

// Commerce shut down 2026-03-31, its Base payments moved to Coinbase's operator on the commerce-payments escrow
const ESCROW_START = new Date('2026-04-02').getTime() / 1000
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
// Coinbase's escrow fees are in Base USDC: Oct-Nov 2026 USDC store->feeReceiver transfers match the old any-token query within 0.3%
const ESCROW_TOKENS = [ADDRESSES.base.USDC]
const PAYMENT_INFO = '(address operator, address payer, address receiver, address token, uint120 maxAmount, uint48 preApprovalExpiry, uint48 authorizationExpiry, uint48 refundExpiry, uint16 minFeeBps, uint16 maxFeeBps, address feeReceiver, uint256 salt)'

// Escrows from the base/commerce-payments README; tokenStore = getTokenStore(0x00f8d7a519c70bf71d411e4bd89bf6d7e3065835), Coinbase's operator, on each.
// A payments.coinbase.com checkout names that operator as captureAuthorizer, with feeRecipient 0x6D8675A52438849d90241cB639fba41bDC3329c8 at 100 bps
// (github.com/hur1et/kwod keep-working-or-die/docs/checkout-observation-2026-09-15.json)
const ESCROWS = [
  { escrow: '0xBdEA0D1bcC5966192B070Fdf62aB4EF5b4420cff', tokenStore: '0x47C5d3fc37F66f7Cbf450Bd3Ea912b0765104Fc3' }, // v1.0.0
  { escrow: '0xf96815976523E00e65Be8f34cA5e64b4f41EB19c', tokenStore: '0x62104e875D79B93cB0270E70DE82c686B1fA8635' }, // v1.1.0, first Coinbase fee at block 56533651 (2026-11-12)
]
const STORE_OF_ESCROW = Object.fromEntries(ESCROWS.map(e => [e.escrow.toLowerCase(), e.tokenStore.toLowerCase()]))
// v1.0.0 events carry feeBps, v1.1.0 (Coinbase's operator from 2026-11-12) emits the exact feeAmount; one getLogs call with OR'd topic0 covers all four
const ESCROW_EVENTS = ['uint16 feeBps', 'uint256 feeAmount'].flatMap(fee => [
  `event PaymentCharged(bytes32 indexed paymentInfoHash, ${PAYMENT_INFO} paymentInfo, uint256 amount, address tokenCollector, ${fee}, address feeReceiver)`,
  `event PaymentCaptured(bytes32 indexed paymentInfoHash, uint256 amount, ${fee}, address feeReceiver)`,
])
const escrowIface = new ethers.Interface(ESCROW_EVENTS)
const ESCROW_TOPICS = ESCROW_EVENTS.map(e => ethers.EventFragment.from(e).topicHash)

// fee = token store transfer to the feeReceiver of a PaymentCharged/PaymentCaptured in the same tx
async function addEscrowFees({ getLogs }: FetchOptions, dailyFees: Balances) {
  const logs = await getLogs({ targets: ESCROWS.map(e => e.escrow), topics: [ESCROW_TOPICS] as any, entireLog: true, parseLog: false })
  // keyed by token store + tx + feeReceiver; v1.1.0 logs the exact fee, so a transfer must also match one of those amounts (null = v1.0.0, any transfer counts)
  const feeLegs = new Map<string, bigint[] | null>()
  // captures carry no token, so a charge in a new token is picked up from the event, an authorized one needs ESCROW_TOKENS
  const tokens = new Set(ESCROW_TOKENS.map(t => t.toLowerCase()))
  for (const log of logs) {
    const { name, args, fragment } = escrowIface.parseLog(log)!
    if (name === 'PaymentCharged') tokens.add(args.paymentInfo.token.toLowerCase())
    const exactFee = fragment.inputs.some(i => i.name === 'feeAmount')
    const fee = BigInt(exactFee ? args.feeAmount : args.feeBps)
    if (fee === 0n) continue
    const key = `${STORE_OF_ESCROW[log.address.toLowerCase()]}-${log.transactionHash}-${args.feeReceiver}`.toLowerCase()
    if (!feeLegs.has(key)) feeLegs.set(key, exactFee ? [] : null)
    if (exactFee) feeLegs.get(key)!.push(fee)
  }
  if (!feeLegs.size) return

  const transfers = await getLogs({
    targets: [...tokens],
    entireLog: true,
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    topics: [TRANSFER_TOPIC, ESCROWS.map(e => ethers.zeroPadValue(e.tokenStore, 32))] as any,
  })
  transfers.forEach((log: any) => {
    if (!log.topics[2]) return
    const amounts = feeLegs.get(`0x${log.topics[1].slice(-40)}-${log.transactionHash}-0x${log.topics[2].slice(-40)}`.toLowerCase())
    if (amounts === undefined) return
    if (amounts) {
      const i = amounts.indexOf(BigInt(log.data))
      if (i === -1) return
      amounts.splice(i, 1)
    }
    dailyFees.add(log.address ?? log.source, log.data, METRIC.SERVICE_FEES)
  })
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain } = options
  const dailyFees = createBalances()

  const logs = await getLogs({ targets: contracts[chain], eventAbi: 'event Transferred (address indexed operator, bytes16 id, address recipient, address sender, uint256 spentAmount, address spentCurrency)' })
  logs.forEach((i: any) => {
    const amount = i.spentAmount / BigInt(100)
    dailyFees.add(i.spentCurrency, amount, METRIC.SERVICE_FEES)
  })

  // windows start 1s early, so gate on the end
  if (chain === CHAIN.BASE && options.toTimestamp > ESCROW_START) await addEscrowFees(options, dailyFees)

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: 'All fees paid by merchants using Coinbase Commerce, and from 2026-04-02 its replacement Coinbase Business on Base.',
  Revenue: 'All fees paid by merchants using Coinbase Commerce, and from 2026-04-02 its replacement Coinbase Business on Base.',
  ProtocolRevenue: 'All fees paid by merchants using Coinbase Commerce, and from 2026-04-02 its replacement Coinbase Business on Base.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "1% of each transfer amount processed through Coinbase Commerce contracts, derived from the Transferred event spentAmount. From 2026-04-02 on Base, the fee Coinbase's operator takes on each charge and capture in the Commerce Payments Protocol escrow (mostly 1%), on the v1.0.0 escrow and from 2026-11-12 on the newer escrow that logs the fee amount.",
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [[CHAIN.ETHEREUM, { deadFrom: '2026-04-02' }], CHAIN.BASE, [CHAIN.POLYGON, { deadFrom: '2026-04-02' }]],
  start: '2023-11-14',
  methodology,
  breakdownMethodology,
}

export default adapter;
