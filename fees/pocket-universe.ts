import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { getAlliumChain, queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";
import { routers } from "./kerberos/routers"

// Kerberus bought Pocket Universe in 2025 (https://www.kerberus.com/articles/pocket_universe) and the wallets below take
// both products' fees. CoW Swap orders carry a partner fee to them: app codes "CoW Swap" and "Kerberus" at 80 bps, then
// "Kerberus" at 100 bps, e.g.
// https://api.cow.fi/mainnet/api/v1/orders/0xe016619c9ba615727d62db1c7a4998a280717b2327df942bc697ded49a66b2e1ef5eb6342ffed7334be0316ec50ef814cf048ffb6aea24dc
// and aave-v3-interface-* orders at 75 bps, next to 25 bps to Aave's Collector, e.g.
// https://api.cow.fi/mainnet/api/v1/orders/0x665c5884a7404e227a1429ef3cf568384c7f8ff22152e78df42f5413e2195e2184ae2eb00ac2f75d308dca9cbd2ef7d633d602146adac349
// CoW Protocol pays it out weekly, in the native token, from its "Solver payouts" Safe 0xa03be496...
// (https://docs.cow.fi/governance/multisigs) and, on Arbitrum and Polygon, from 0x66331f0b..., a Safe that shares its
// owners. First payout 2026-02-25, none on OP Mainnet. A payout lands about a week after its trades and is net of CoW's
// cut, so this counts what the wallets receive, not the gross fee. The payouts are internal value transfers
// (Safe.execTransaction), so they are read from Allium.
const COW_PARTNER_FEE_RECIPIENTS = ['0x147cf09e7373b8fda6f12021f1b0f98d6da1a566', '0x9c87bb379d5ff2fcbf2f83e619f9fccb95a40ad9']
const COW_PARTNER_FEE_PAYERS = ['0xa03be496e67ec29bc62f01a428683d7f9c204930', '0x66331f0b9cb30d38779c786bda5a3d57d12fba50']
const COW_PARTNER_FEES_FROM = 1771977600 // 2026-02-25, the first payout
const COW_PARTNER_FEES = 'CoW Swap Partner Fees'
const toSql = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ')

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const swapFees = await addTokensReceived({
    options, targets: [
      '0x77777D91c0B8Ec9984a05302E4Ef041dcCf77FeE',
      '0xc8c0e780960f954c3426a32b6ab453248d632b59',
      '0x147CF09E7373B8FDA6f12021F1b0f98D6da1A566',
      '0x9c87bb379d5Ff2fCbf2F83e619f9fCcb95a40AD9'
    ], fromAdddesses: [...routers,
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' // lifi
    ]
  })
  dailyFees.addBalances(swapFees, METRIC.SWAP_FEES)

  if (options.chain !== CHAIN.OPTIMISM && options.endTimestamp > COW_PARTNER_FEES_FROM) {
    const [{ amount }] = await queryAllium(`
      SELECT COALESCE(SUM(raw_amount), 0) AS amount
      FROM ${getAlliumChain(options.chain)}.assets.native_token_transfers
      WHERE to_address IN (${toSql(COW_PARTNER_FEE_RECIPIENTS)})
        AND from_address IN (${toSql(COW_PARTNER_FEE_PAYERS)})
        AND transfer_type = 'value_transfer'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `)
    dailyFees.addGasToken(amount, COW_PARTNER_FEES)
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
};

const info = {
  methodology: {
    Fees: "All fess paid by users while use extension.",
    Revenue: "All fess paid by users while use extension.",
    ProtocolRevenue: "All fess paid by users while use extension.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Fees paid in tokens to the extension's fee wallets by swap routers and LI.FI.",
      [COW_PARTNER_FEES]: "Partner fee on CoW Swap orders, as paid out weekly by CoW Protocol to the fee wallets, net of CoW's cut.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "Fees paid in tokens to the extension's fee wallets by swap routers and LI.FI.",
      [COW_PARTNER_FEES]: "CoW Swap partner fee paid out to the fee wallets.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "Fees paid in tokens to the extension's fee wallets by swap routers and LI.FI.",
      [COW_PARTNER_FEES]: "CoW Swap partner fee paid out to the fee wallets.",
    },
  },
}

const adapter: SimpleAdapter = {
  fetch, methodology: info.methodology, breakdownMethodology: info.breakdownMethodology,
  start: '2024-04-10',
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.POLYGON, CHAIN.BSC, CHAIN.OPTIMISM,],
  adapter: {},
};
export default adapter;
