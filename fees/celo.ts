import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// Celo users can pay gas in an ERC20 fee currency (CIP-64 fee abstraction). For those transactions
// gas_used * gas_price is an amount of the fee currency, not of CELO, so fees are summed per fee currency
// and each sum is priced in its own currency. https://docs.celo.org/build/fee-abstraction/overview
//
// 6-decimal tokens pay gas through an 18-decimal adapter, and the adapter is the transaction's feeCurrency.
// Celo prices gas in 18 decimals, so adapter units / 1e12 (10 ** (18 - 6)) are the token's base units.
// Pairs from https://docs.celo.org/build/tools/contracts/fee-currencies; the four tokens' decimals() is 6 on-chain.
// Mento stablecoins and WETH pay gas directly (18 decimals) and are added as themselves; an adapter missing
// from this map would be added under its own address, which has no price, so it is dropped rather than mispriced.
const ADAPTER_SCALE = 1e12
const FEE_CURRENCY_ADAPTERS: Record<string, string> = {
  '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72': ADDRESSES.celo.USDT_1, // USD₮ adapter
  '0x2f25deb3848c207fc8e0c34035b3ba7fc157602b': ADDRESSES.celo.USDC, // USDC adapter
  '0x0357ee22278c922e1d36cfe6b899269b161880c4': '0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771', // USA₮ adapter -> USA₮
  '0x857bf24e29da0773687e804a743c2e421a394c16': '0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff', // XAUt0 adapter -> XAUt0
}

// Base fees go to the FeeHandler 0xcD437749E43A154C07F3553504c68fBfD56B8778. It burned 80% of them until governance tx
// 0xf10e6ec1f9cc37c24b9ce9117461a731e73fb3edb5086a1db4d14e92f7d9d44d (2025-03-30 21:21 UTC) gave cLabs 90% and the
// carbon fund 10%, leaving a burn fraction of 0; tx 0x76b7fe2ae05d1649c896c9bacfef2a55ccf49b48b5cc4e61cfbdc60d56162d31
// (2026-05-09) set cLabs to 100%. Priority fees go to the sequencer fee vault 0x4200000000000000000000000000000000000011,
// whose recipient is the same cLabs Safe 0x7a1e98fc9a008107dbd1f430a05ace8cf6f3fe19.
// Earlier days burned part of the base fee, which is not computed here, so they report fees only.
const NO_BURN_FROM = 1743379200 // 2025-03-31 00:00 UTC, the first full day with a burn fraction of 0
const SUPPLY_SIDE_LABEL = 'Transaction Gas Fees To Sequencer'

// The cLabs Safe is a pass-through for the Community Fund since 2026-04-09: it sends gas fees net of Ethereum settlement gas, EigenDA and a
// 15% OP Stack / Superchain revenue share to Governance 0xD533Ca259b330c7A88f74E000a3FaEa2d63B7972 (CELOccelerate,
// https://github.com/celo-org/governance/blob/main/CGPs/cgp-0233.md; reports with txs in
// https://forum.celo.org/t/initiating-ongoing-celo-chain-revenue-transactions/13494, each within 0.01% of 0.85 x (gross - L1 - EigenDA)).
// All CELO the Safe has sent since 2026-04-01 went there. Revenue is booked as it accrues, from the same formula.
// The batcher posts to the inbox 0xff00000000000000000000000000000000042220, the proposer to the DisputeGameFactory
// 0xFbAC162162f4009Bb007C6DeBC36B1dAC10aF683. EigenDA is paid off Ethereum and is not deducted: 0-1.1% of gross per report.
// The reports count all gas fees, so the carbon fund's 10% of base fees until 2026-05-09 is not deducted. The 1,748,950 CELO returned
// on 2026-04-01 (tx 0xfbe1dac031726b6f580b561bfc2a80262b9529d09e4463fc3600cc74dce31a86) is a one-off for the first L2 year and is not booked.
const COMMUNITY_FUND_FROM = 1775692800 // 2026-04-09 00:00 UTC, the first day of Celo's revenue reports
const BATCHER = '0x0cd08c7f7a96aa9635f761b49216b9ea74c5ca60' // batcherHash() on Celo's SystemConfig 0x89E31965D844a309231B1f17759Ccaf1b7c09861
const PROPOSER = '0x79d14553d6b3484f5612272b43c219a882415d33' // isAllowedProposer() on AccessManager 0xf59a19c5578291cb7fd22618d16281adf76f2816, of game type 42, the portal's respectedGameType
const SUPERCHAIN_SHARE = 0.15
const L1_COSTS_LABEL = 'Ethereum L1 Execution Gas Costs'
const SUPERCHAIN_SHARE_LABEL = 'Superchain Revenue Share'

const fetch = async (options: FetchOptions) => {
  const withL1Costs = options.startOfDay >= COMMUNITY_FUND_FROM
  const rows: any[] = await queryDuneSql(options, `
    SELECT
      'fee' AS kind,
      LOWER(CAST(fee_currency AS varchar)) AS id,
      SUM(CAST(gas_used AS double) * CAST(gas_price AS double)) AS raw
    FROM celo.transactions
    WHERE TIME_RANGE
    GROUP BY 2
    ${withL1Costs ? `
    UNION ALL
    SELECT
      'l1' AS kind,
      LOWER(CAST("from" AS varchar)) AS id,
      SUM(CAST(gas_used AS double) * CAST(gas_price AS double)) AS raw
    FROM ethereum.transactions
    WHERE TIME_RANGE
      AND "from" IN (${BATCHER}, ${PROPOSER})
    GROUP BY 2` : ''}
  `)
  const feeRows = (rows ?? []).filter(({ kind }) => kind === 'fee')
  if (!feeRows.length) throw new Error(`celo: Dune returned no transactions for ${options.dateString}`)

  const dailyFees = options.createBalances()
  for (const { id: fee_currency, raw: fee_raw } of feeRows) {
    // fee_currency is null when gas is paid in CELO; same CoinGecko id the blockscout config priced it with
    if (!fee_currency) dailyFees.addCGToken('celo', fee_raw / 1e18, METRIC.TRANSACTION_GAS_FEES)
    else if (FEE_CURRENCY_ADAPTERS[fee_currency]) dailyFees.add(FEE_CURRENCY_ADAPTERS[fee_currency], fee_raw / ADAPTER_SCALE, METRIC.TRANSACTION_GAS_FEES)
    else dailyFees.add(fee_currency, fee_raw, METRIC.TRANSACTION_GAS_FEES)
  }

  if (options.startOfDay < NO_BURN_FROM) return { dailyFees }

  if (!withL1Costs) {
    const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL)
    return { dailyFees, dailyRevenue: 0, dailyHoldersRevenue: 0, dailySupplySideRevenue }
  }

  const l1Rows = rows.filter(({ kind }) => kind === 'l1')
  // the batcher and the proposer post every day: a day without both is a rotated key or missing data, so it throws
  const senders = new Set(l1Rows.map(({ id }) => id))
  if (!senders.has(BATCHER) || !senders.has(PROPOSER)) throw new Error(`celo: no batcher or proposer gas for ${options.dateString}`)

  const l1Costs = options.createBalances()
  for (const { raw } of l1Rows) l1Costs.addCGToken('ethereum', raw / 1e18, L1_COSTS_LABEL)

  const superchainShare = dailyFees.clone(SUPERCHAIN_SHARE, SUPERCHAIN_SHARE_LABEL)
  superchainShare.subtract(l1Costs.clone(SUPERCHAIN_SHARE), SUPERCHAIN_SHARE_LABEL)
  const dailySupplySideRevenue = l1Costs.clone()
  dailySupplySideRevenue.addBalances(superchainShare)

  const dailyRevenue = dailyFees.clone()
  dailyRevenue.subtract(dailySupplySideRevenue, METRIC.TRANSACTION_GAS_FEES)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailyHoldersRevenue: 0, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CELO],
  start: '2020-05-28',
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  // days before 2025-03-31 return labelled fees only: the share of base fees burned then is not computed
  skipBreakdownValidation: true,
  methodology: {
    Fees: 'Gas fees paid by users, in CELO or in the fee currency they chose (USD₮, USDC, USA₮, Mento stablecoins), each priced in the currency it was paid in.',
    Revenue: 'Net sequencer revenue owed to the Celo Community Fund from 2026-04-09: gas fees minus the gas Celo pays on Ethereum to post batches and proposals and the 15% OP Stack revenue share. No gas fees have been burned since 2025-03-31, and from then to 2026-04-08 cLabs kept them, so revenue is 0 for those days.',
    ProtocolRevenue: 'Net sequencer revenue owed to the Celo Community Fund, the on-chain treasury, from 2026-04-09: gas fees minus Ethereum settlement gas and the 15% OP Stack revenue share.',
    HoldersRevenue: 'Burned coins. No gas fees have been burned since 2025-03-31, so holders revenue is 0 from that date.',
    SupplySideRevenue: 'Gas fees paid to cLabs, which runs the Celo sequencer, from 2025-03-31 to 2026-04-08; from 2026-04-09, the gas paid on Ethereum to settle the chain and the 15% OP Stack revenue share.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users, each priced in the currency it was paid in: CELO, or USD₮, USDC, USA₮, XAUt0 and Mento stablecoins through fee abstraction.',
    },
    Revenue: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees net of Ethereum settlement gas and the OP Stack revenue share, owed to the Celo Community Fund from 2026-04-09.',
    },
    ProtocolRevenue: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees net of Ethereum settlement gas and the OP Stack revenue share, owed to the Celo Community Fund from 2026-04-09.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Base fees paid to cLabs through the FeeHandler and priority fees through the sequencer fee vault, 2025-03-31 to 2026-04-08. 10% of base fees went to a carbon offset fund instead.',
      [L1_COSTS_LABEL]: 'ETH paid on Ethereum by the Celo batcher to post batches and by the proposer to create and resolve dispute games, from 2026-04-09.',
      [SUPERCHAIN_SHARE_LABEL]: '15% of gas fees net of Ethereum settlement gas: the OP Stack / Superchain revenue share deducted before revenue goes to the Community Fund, from 2026-04-09.',
    },
  },
}

export default adapter;
