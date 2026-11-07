import { Adapter, Dependencies, FetchOptions, } from '../adapters/types';
import { getAlliumChain, queryAllium } from '../helpers/allium';
import { CHAIN } from '../helpers/chains';

// Safe's partner-fee recipients on CoW Swap: 0x63695 until the migration of 2025-03-31
// (https://etherscan.io/tx/0x69c53420e8d37122a5513896c7953e6963eea000f45f3698d50d891f56b48ab9), then 0xE344 and, for the
// CoW Swap Safe App, 0x8025 (https://github.com/cowprotocol/cowswap/commit/f72485bc8b16fff0a96b5b045b83be1fd4e53368)
const FEE_RECIPIENTS = [
  '0x63695eee2c3141bde314c5a6f89b98e62808d716',
  '0xe344241493d573428076c022835856a221db3e26',
  '0x8025bacf968aa82bdfe51b513123b55bfb0060d3',
]
// CoW Protocol pays partner fees weekly, in the native token, from its "Solver payouts" Safe
// (https://docs.cow.fi/governance/multisigs) and, on Arbitrum and Polygon, from 0x66331f0b..., a Safe that shares its owners.
// Only these count: the recipients also receive other transfers, e.g. a LI.FI refund
// https://basescan.org/tx/0xd7786cc6b1bae1385067425f754bb4ed4e8c18a2016ad7a44a7367379d05a425
const COW_PAYOUT_SAFES = [
  '0xa03be496e67ec29bc62f01a428683d7f9c204930',
  '0x66331f0b9cb30d38779c786bda5a3d57d12fba50',
]
const COW_PARTNER_FEES = 'CoW Swap Partner Fees'
const toSql = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ')

// order example https://explorer.cow.fi/orders/0x6926d210ec9c5a9acb36db99842b10cd9ad328d391fcc42d23cf49bfb1b17720d7f876620bdff1c9aba5b444128d1722ddd678b367083dfb?tab=overview
// The payouts are internal value transfers (Safe.execTransaction), so they are read from Allium.
const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const [{ amount }] = await queryAllium(`
    SELECT COALESCE(SUM(raw_amount), 0) AS amount
    FROM ${getAlliumChain(options.chain)}.assets.native_token_transfers
    WHERE to_address IN (${toSql(FEE_RECIPIENTS)})
      AND from_address IN (${toSql(COW_PAYOUT_SAFES)})
      AND transfer_type = 'value_transfer'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `)
  dailyFees.addGasToken(amount, COW_PARTNER_FEES)
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    // start = each chain's first payout
    [CHAIN.ETHEREUM]: { fetch, start: '2024-07-16' },
    [CHAIN.ARBITRUM]: { fetch, start: '2024-12-17' },
    [CHAIN.XDAI]: { fetch, start: '2024-12-17' },
    [CHAIN.BASE]: { fetch, start: '2025-01-07' },
    [CHAIN.AVAX]: { fetch, start: '2025-07-08' },
    [CHAIN.POLYGON]: { fetch, start: '2025-07-23' },
    [CHAIN.BSC]: { fetch, start: '2025-10-31' },
  },
  methodology: {
    Fees: "Partner fee on swaps made with Safe through CoW Swap, as paid out weekly by CoW Protocol, net of CoW's cut.",
    Revenue: 'All fees paid out to Safe are collected by Safe.',
    ProtocolRevenue: 'All fees paid out to Safe are collected by Safe.',
  },
  breakdownMethodology: {
    Fees: {
      [COW_PARTNER_FEES]: "Partner fee on swaps made with Safe through CoW Swap, as paid out weekly by CoW Protocol, net of CoW's cut.",
    },
    Revenue: {
      [COW_PARTNER_FEES]: 'CoW Swap partner fee paid out to Safe.',
    },
    ProtocolRevenue: {
      [COW_PARTNER_FEES]: 'CoW Swap partner fee paid out to Safe.',
    },
  },
}

export default adapter;
