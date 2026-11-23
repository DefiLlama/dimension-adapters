// https://usyc.hashnote.com/
// Fees are read from the on-chain USYC price reports. Each report carries the gross yield of the period, and the
// performance fee is minted as USYC to the fee recipient 0xed96e247655361031aee6514cd1b89c7141b59d5 in the same tx.
//  - until 2024-08-27: BalanceReported on the USYC oracle proxy 0x4c48...8b3e (YieldTokenAggregator, rounds 1-290)
//  - from 2024-08-28: Transmitted on the PriceReporterProxy 0x9fde...23d7 (round 1 at block 20626973)
// The https://usyc.hashnote.com/api/price-reports endpoint this used before only serves the last 45 reports.

import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const USYC = '0x136471a34f6ef19fe571effc1ca711fdb8e49f2b'
const ORACLE = '0x4c48bcb2160f8e0adbf9d4f3b034f1e36d1f8b3e'
const PRICE_REPORTER = '0x9fde717a21c5b272b8956d3aa0c3551e1ffd23d7'

const REPORTER_SWITCH = 1724803200 // 2024-08-28 00:00 UTC

// interest is the gross yield of the round in USD with 2 decimals, price is USYC in USD with 8 decimals.
const BALANCE_REPORTED = 'event BalanceReported(uint80 roundId, uint256 balance, uint256 interest, uint256 price, uint256 updatedAt)'
const TRANSFER = 'event Transfer(address indexed from, address indexed to, uint256 value)'

// The reporter was upgraded on 2026-07-27 (round 477): the event gained an embeddedIncome field, which changes its topic.
const TRANSMITTED_EVENTS = [
  'event Transmitted(address indexed token, uint256 indexed roundId, uint256 principal, uint256 interest, uint256 totalSupply, uint256 updatedAt, uint256 price, uint256 fee)',
  'event Transmitted(address indexed token, uint256 indexed roundId, uint256 principal, uint256 interest, uint256 totalSupply, uint256 updatedAt, uint256 price, uint256 fee, uint256 embeddedIncome)',
]

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // both amounts in USD with 6 decimals
  const addReport = (grossYield: bigint, fee: bigint) => {
    const holdersYield = Number(grossYield - fee) / 1e6
    const performanceFee = Number(fee) / 1e6
    dailyFees.addUSDValue(holdersYield, METRIC.ASSETS_YIELDS)
    dailyFees.addUSDValue(performanceFee, METRIC.PERFORMANCE_FEES)
    dailySupplySideRevenue.addUSDValue(holdersYield, METRIC.ASSETS_YIELDS)
    dailyRevenue.addUSDValue(performanceFee, METRIC.PERFORMANCE_FEES)
  }

  if (options.startTimestamp < REPORTER_SWITCH) {
    const [reports, transfers] = await Promise.all([
      options.getLogs({ target: ORACLE, eventAbi: BALANCE_REPORTED, onlyArgs: false }),
      options.getLogs({ target: USYC, eventAbi: TRANSFER, onlyArgs: false }),
    ])
    const feeMintedInTx: Record<string, bigint> = {}
    transfers
      .filter((log: any) => log.args.from === ADDRESSES.null)
      .forEach((log: any) => {
        feeMintedInTx[log.transactionHash] = (feeMintedInTx[log.transactionHash] ?? BigInt(0)) + BigInt(log.args.value)
      })
    reports
      .filter((log: any) => Number(log.args.updatedAt) < REPORTER_SWITCH)
      .forEach((log: any) => {
        const grossYield = BigInt(log.args.interest) * BigInt(1e4)
        const fee = (feeMintedInTx[log.transactionHash] ?? BigInt(0)) * BigInt(log.args.price) / BigInt(1e8)
        addReport(grossYield, fee)
      })
  }

  if (options.endTimestamp > REPORTER_SWITCH) {
    for (const eventAbi of TRANSMITTED_EVENTS) {
      const logs = await options.getLogs({ target: PRICE_REPORTER, eventAbi })
      logs
        .filter((log: any) => log.token.toLowerCase() === USYC)
        .forEach((log: any) => {
          // interest (and embeddedIncome, added in the upgrade) is the gross yield of the period in USD, 6 decimals.
          const grossYield = BigInt(log.interest) + BigInt(log.embeddedIncome ?? 0)
          // fee is the performance fee in USYC shares (6 decimals), minted to the fee recipient in the same tx. Valued at
          // the report's price (18 decimals) it is 10% of the gross yield, the FeeScheduleSet performance rate.
          const fee = BigInt(log.fee) * BigInt(log.price) / BigInt(1e18)
          addReport(grossYield, fee)
        })
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-07-06', // first oracle round, block 17637029
  methodology: {
    Fees: "All yields generated from USYC backing assets, reported at each price report.",
    Revenue: "Performance fee taken from the yield, paid to the USYC manager as newly minted USYC.",
    ProtocolRevenue: "Performance fee taken from the yield, paid to the USYC manager as newly minted USYC.",
    SupplySideRevenue: "Yield left for USYC holders after the performance fee, accrued through the USYC price.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield of the backing assets that goes to USYC holders.",
      [METRIC.PERFORMANCE_FEES]: "Performance fee minted as USYC at each price report, valued at the report's price.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "All of the performance fee goes to the USYC manager.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "All of the performance fee goes to the USYC manager.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield of the backing assets that goes to USYC holders.",
    },
  },
};

export default adapter;
