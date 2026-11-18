import ADDRESSES from '../../helpers/coreAssets.json'
import { SimpleAdapter, FetchOptions, FetchResultV2 } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'

interface Config {
  token: string
  treasury: string
  start: string
}

/**
 * BTC.b fees documentation: https://docs.lombard.finance/use/btcb
 * Redemption fee: fixed 0.0001 BTC.b (10000 units, 8 decimals) per redeemForBtc call.
 * The fee is tracked as a fee-sized Transfer
 * mint (from 0x0) to the Lombard treasury on the BTC.b token contract.
 * Mint fee is 0% and bridging (Chainlink CCIP) has no Lombard-side fee.
 */
const REDEEM_FEE = 10000
const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const toTopic = (address: string) => '0x' + address.toLowerCase().replace('0x', '').padStart(64, '0')

const chainConfig: Record<string, Config> = {
  [CHAIN.ETHEREUM]: {
    token: ADDRESSES.ethereum.BTC_b,
    treasury: '0x251a604E8E8f6906d60f8dedC5aAeb8CD38F4892', // Lombard Treasury Safe
    start: '2025-12-29',
  },
  [CHAIN.AVAX]: {
    token: ADDRESSES.avax.BTC_b,
    treasury: '0xaa4bc534bc7be0e28a0686ab6910a9b21dfdc2b1', // Lombard Treasury (Avalanche)
    start: '2026-01-28',
  },
  [CHAIN.MEGAETH]: {
    token: ADDRESSES.megaeth.BTC_b,
    treasury: '0x3F6BF1C36CcBb59eAF8415301a0ceC73c344a079', // Lombard Treasury (MegaETH)
    start: '2025-12-01',
  },
  [CHAIN.MONAD]: {
    token: ADDRESSES.monad.BTC_b,
    treasury: '0xAa4bc534bc7Be0E28a0686Ab6910A9B21dFdc2B1', // Lombard Treasury (Monad)
    start: '2025-11-20',
  },
  [CHAIN.STABLE]: {
    token: ADDRESSES.stable.BTC_b,
    treasury: '0x3F6BF1C36CcBb59eAF8415301a0ceC73c344a079', // Lombard Treasury (Stable)
    start: '2025-11-26',
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const { token, treasury } = chainConfig[options.chain]

  // Mints (from 0x0) to the treasury on the BTC.b token contract only
  const logs = await options.getLogs({
    target: token,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, toTopic(ZERO_ADDRESS), toTopic(treasury)],
    onlyArgs: true,
  })

  // Keep only fee-sized mints; variable mint-time mints are excluded
  const feeMints = logs.filter((log: any) =>
    log.from.toLowerCase() === ZERO_ADDRESS &&
    log.to.toLowerCase() === treasury.toLowerCase() &&
    Number(log.value) === REDEEM_FEE
  )

  for (const _ of feeMints) {
    dailyFees.add(token, REDEEM_FEE, METRIC.MINT_REDEEM_FEES)
    dailyUserFees.add(token, REDEEM_FEE, METRIC.MINT_REDEEM_FEES)
    dailyProtocolRevenue.add(token, REDEEM_FEE, METRIC.MINT_REDEEM_FEES)
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyProtocolRevenue.clone(),
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees:
      'A fixed redemption fee of 0.0001 BTC.b is charged for each BTC redemption (redeemForBtc). Minting is free (0%) and bridging via Chainlink CCIP has no Lombard-side fee. The fee is tracked as fee-sized (10000 units) BTC.b mints to the Lombard treasury; variable-amount mints to the treasury are excluded.',
    UserFees:
      'Users pay a fixed 0.0001 BTC.b redemption fee per BTC redemption.',
    Revenue:
      'All redemption fees collected from BTC.b redemptions, kept by the protocol.',
    ProtocolRevenue:
      'All redemption fees collected from BTC.b redemptions, sent to the Lombard treasury.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: 'Fixed redemption fee (0.0001 BTC.b) charged for each BTC.b redemption to BTC.',
    },
    UserFees: {
      [METRIC.MINT_REDEEM_FEES]: 'Fixed redemption fee (0.0001 BTC.b) paid by users for each BTC.b redemption to BTC.',
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: 'Fixed redemption fee (0.0001 BTC.b) charged for each BTC.b redemption to BTC.',
    },
    ProtocolRevenue: {
      [METRIC.MINT_REDEEM_FEES]: 'Fixed redemption fee (0.0001 BTC.b) charged for each BTC.b redemption to BTC.',
    },
  },
}

export default adapter
