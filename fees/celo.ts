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

const fetch = async (options: FetchOptions) => {
  const rows: any[] = await queryDuneSql(options, `
    SELECT
      LOWER(CAST(fee_currency AS varchar)) AS fee_currency,
      SUM(CAST(gas_used AS double) * CAST(gas_price AS double)) AS fee_raw
    FROM celo.transactions
    WHERE TIME_RANGE
    GROUP BY 1
  `)
  if (!rows?.length) throw new Error(`celo: Dune returned no transactions for ${options.dateString}`)

  const dailyFees = options.createBalances()
  for (const { fee_currency, fee_raw } of rows) {
    // fee_currency is null when gas is paid in CELO; same CoinGecko id the blockscout config priced it with
    if (!fee_currency) dailyFees.addCGToken('celo', fee_raw / 1e18, METRIC.TRANSACTION_GAS_FEES)
    else if (FEE_CURRENCY_ADAPTERS[fee_currency]) dailyFees.add(FEE_CURRENCY_ADAPTERS[fee_currency], fee_raw / ADAPTER_SCALE, METRIC.TRANSACTION_GAS_FEES)
    else dailyFees.add(fee_currency, fee_raw, METRIC.TRANSACTION_GAS_FEES)
  }

  if (options.startOfDay < NO_BURN_FROM) return { dailyFees }

  const dailySupplySideRevenue = dailyFees.clone(1, SUPPLY_SIDE_LABEL)
  return { dailyFees, dailyRevenue: 0, dailyHoldersRevenue: 0, dailySupplySideRevenue }
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
    Revenue: 'Burned coins. No gas fees have been burned since 2025-03-31, so revenue is 0 from that date.',
    HoldersRevenue: 'Burned coins. No gas fees have been burned since 2025-03-31, so holders revenue is 0 from that date.',
    SupplySideRevenue: 'Gas fees paid to cLabs, which runs the Celo sequencer, from 2025-03-31.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users, each priced in the currency it was paid in: CELO, or USD₮, USDC, USA₮, XAUt0 and Mento stablecoins through fee abstraction.',
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: 'Base fees paid to cLabs through the FeeHandler and priority fees through the sequencer fee vault. From 2025-03-31 to 2026-05-08, 10% of base fees went to a carbon offset fund instead.',
    },
  },
}

export default adapter;
