// https://usyc.hashnote.com/
// Fees are read from the Transmitted events of the USYC PriceReporter (PriceReporterProxy 0x9fde...23d7).
// The https://usyc.hashnote.com/api/price-reports endpoint this used before only serves the last 45 reports.

import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const PRICE_REPORTER = '0x9fde717a21c5b272b8956d3aa0c3551e1ffd23d7'
const USYC = '0x136471a34f6ef19fe571effc1ca711fdb8e49f2b'

// Round 1 for USYC on the PriceReporter is block 20626973 (2024-08-28 11:56 UTC). Days stored before that came from the
// old API and can't be rebuilt on-chain, so throw instead of returning 0 for them.
const FIRST_REPORT_TIMESTAMP = 1724803200 // 2024-08-28 00:00 UTC

// The reporter was upgraded on 2026-07-27 (round 477): the event gained an embeddedIncome field, which changes its topic.
const TRANSMITTED_EVENTS = [
  'event Transmitted(address indexed token, uint256 indexed roundId, uint256 principal, uint256 interest, uint256 totalSupply, uint256 updatedAt, uint256 price, uint256 fee)',
  'event Transmitted(address indexed token, uint256 indexed roundId, uint256 principal, uint256 interest, uint256 totalSupply, uint256 updatedAt, uint256 price, uint256 fee, uint256 embeddedIncome)',
]

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  if (options.startTimestamp < FIRST_REPORT_TIMESTAMP)
    throw new Error(`hashnote-usyc: no on-chain price reports for USYC before 2024-08-28`)

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
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
        dailyFees.add(ADDRESSES.ethereum.USDC, grossYield - fee, METRIC.ASSETS_YIELDS)
        dailyFees.add(ADDRESSES.ethereum.USDC, fee, METRIC.PERFORMANCE_FEES)
        dailySupplySideRevenue.add(ADDRESSES.ethereum.USDC, grossYield - fee, METRIC.ASSETS_YIELDS)
        dailyRevenue.add(ADDRESSES.ethereum.USDC, fee, METRIC.PERFORMANCE_FEES)
      })
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-06-14',
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
