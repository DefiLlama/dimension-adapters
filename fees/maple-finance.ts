import { CHAIN } from "../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from '../helpers/metrics';
import { queryDuneSql } from "../helpers/dune";

const feeManager = '0xFeACa6A5703E6F9DE0ebE0975C93AE34c00523F2'

// Open-Term Loan
const openTermLoanManagerFactory = '0x90b14505221a24039A2D11Ad5862339db97Cc160'

const claimed_funds_distributed_event = 'event ClaimedFundsDistributed(address indexed loan_, uint256 principal_, uint256 netInterest_, uint256 delegateManagementFee_, uint256 delegateServiceFee_, uint256 platformManagementFee_, uint256 platformServiceFee_)';
const loan_manager_deployed_event = 'event InstanceDeployed(uint256 indexed version_, address indexed instance_, bytes initializationArguments_)'

// Fixed-Term Loan
const fixedTermLoanManagerFactory = '0x1551717AE4FdCB65ed028F7fB7abA39908f6A7A6'
const fixedTermLoanFactoryV1 = '0x36a7350309B2Eb30F3B908aB0154851B5ED81db0'
const fixedTermLoanFactoryV2 = '0xeA067DB5B32CE036Ee5D8607DBB02f544768dBC6'

const skyStrategyFactory = '0x27327E08de810c687687F95bfCE92088089b56dB'
const aaveStrategyFactory = '0x01ab799f77F9a9f4dd0D2b6E7C83DCF3F48D5650'

const origination_fees_paid_event = 'event OriginationFeesPaid(address loan_, uint256 delegateOriginationFee_, uint256 platformOriginationFee_)';
const service_fees_paid_event = 'event ServiceFeesPaid(address loan_, uint256 delegateServiceFee_, uint256 partialRefinanceDelegateServiceFee_, uint256 platformServiceFee_, uint256 partialRefinancePlatformServiceFee_)'
const management_fees_paid_event = 'event ManagementFeesPaid(address indexed loan_, uint256 delegateManagementFee_, uint256 platformManagementFee_)';
const strategy_fees_paid_event = 'event StrategyFeesCollected (uint256 fees)';
// Fixed-term loans have shipped three PaymentMade signatures. interestPaid_ is always the second
// argument. Matching only the two-argument version silently dropped every fixed-term payment from
// 2022-09 on. The three-argument fees_ is the same fee MapleLoanFeeManager reports (checked: all
// 94 of those payments carry a fee-manager event in the same tx), so it is ignored here; the
// four-argument delegate/treasury fees predate the fee manager and are reported nowhere else, so
// they are counted. Both are charged on top of the interest, not taken out of it.
const interest_paid_events = [
  'event PaymentMade(uint256 principalPaid_, uint256 interestPaid_)',
  'event PaymentMade(uint256 principalPaid_, uint256 interestPaid_, uint256 fees_)',
  'event PaymentMade(uint256 principalPaid_, uint256 interestPaid_, uint256 delegateFeePaid_, uint256 treasuryFeePaid_)',
]

// Share of revenue spent buying back SYRUP. Each rate is confirmed against the monthly
// buybacks published on https://maple.finance/transparency (buyback / revenue, same month).
// ponytail: MIP-021 is tiered on MONTHLY revenue (10% under $1.5m, 20% to $2m, 30% above) and a
// daily fetch cannot see the month, so 10% is hardcoded - Maple has run $1.0-1.4m/month all of
// 2026. Revisit if a month clears $1.5m, or when MIP-021's 6-month term ends (Jan 2027).
function getHoldersRevenueShare(date: number): number {
  if (date < 1735689600) return 0     // no buyback before 2025-01-01
  if (date < 1751328000) return 0.2   // MIP-013 / MIP-016, Q1+Q2 2025
  if (date < 1782950400) return 0.25  // MIP-019 Syrup Strategic Fund, 2025-07-01 -> 2026-06-30
  return 0.1                          // MIP-021 tiered buyback, from 2026-07-01
}

const STRATEGY_FEES = 'Strategy Fees';

const fetch = async (options: FetchOptions) => {

  if (options.chain === CHAIN.OFF_CHAIN) {
    const duneQuery = `
    select coalesce(otc_revenue, 0) as otc_fees from dune."maple-finance".dataset_maple_otc_by_day where timestamp >= ${options.startOfDay} and timestamp < ${options.startOfDay + 86400}`;
    const duneData = await queryDuneSql(options, duneQuery);

    const holdersShare = getHoldersRevenueShare(options.startOfDay);
    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(Number(duneData?.[0]?.otc_fees || 0), METRIC.MANAGEMENT_FEES);

    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees.clone(1 - holdersShare),
      dailyHoldersRevenue: dailyFees.clone(holdersShare, METRIC.TOKEN_BUY_BACK),
      dailySupplySideRevenue: 0
    }
  }

  const { getLogs } = options
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const holdersShare = getHoldersRevenueShare(options.startOfDay);

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  // Fixed Term Loan
  if (toBlock >= 13997864) {
    const logs_fixed_term_loan_deployed = await getLogs({
      targets: [fixedTermLoanFactoryV1, fixedTermLoanFactoryV2],
      eventAbi: loan_manager_deployed_event,
      fromBlock: 13997864, // Jan-13-2022
      cacheInCloud: true,
    })

    const fixed_term_loans: string[] = logs_fixed_term_loan_deployed.map(e => e.instance_);

    // const fixed_term_loan_managers = logs_fixed_term_loan_manager_deployed.map(e => e.instance_);

    if (fixed_term_loans.length) {
      const fixed_term_loan_assets = await options.api.multiCall({ abi: 'address:fundsAsset', calls: fixed_term_loans })

      const fixed_term_loan_to_asset: Record<string, string> = {};
      fixed_term_loans.forEach((loan, i) => {
        fixed_term_loan_to_asset[loan.toLowerCase()] = fixed_term_loan_assets[i];
      })

      // Origination fees from fixed-term loans
      const logs_origination_fees = await getLogs({
        target: feeManager,
        eventAbi: origination_fees_paid_event,
      })

      // Service fees from fixed-term loans  
      const logs_service_fees = await getLogs({
        target: feeManager,
        eventAbi: service_fees_paid_event,
      })

      const logs_interest_paid = (await Promise.all(interest_paid_events.map(eventAbi => getLogs({
        targets: fixed_term_loans,
        eventAbi,
        entireLog: true,
        parseLog: true,
      })))).flat()

      logs_origination_fees.forEach((e: any) => {
        const asset = fixed_term_loan_to_asset[e.loan_?.toLowerCase()]
        dailyFees.add(asset, e.delegateOriginationFee_, METRIC.MANAGEMENT_FEES)
        dailyFees.add(asset, e.platformOriginationFee_, METRIC.MANAGEMENT_FEES)

        dailyRevenue.add(asset, e.delegateOriginationFee_, METRIC.MANAGEMENT_FEES)
        dailyRevenue.add(asset, e.platformOriginationFee_, METRIC.MANAGEMENT_FEES)

      })

      logs_service_fees.forEach((e: any) => {
        const asset = fixed_term_loan_to_asset[e.loan_?.toLowerCase()]
        dailyFees.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
        dailyFees.add(asset, e.partialRefinanceDelegateServiceFee_, METRIC.SERVICE_FEES)
        dailyFees.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)
        dailyFees.add(asset, e.partialRefinancePlatformServiceFee_, METRIC.SERVICE_FEES)

        dailyRevenue.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
        dailyRevenue.add(asset, e.partialRefinanceDelegateServiceFee_, METRIC.SERVICE_FEES)
        dailyRevenue.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)
        dailyRevenue.add(asset, e.partialRefinancePlatformServiceFee_, METRIC.SERVICE_FEES)

      })

      logs_interest_paid.forEach((e: any) => {
        const asset = fixed_term_loan_to_asset[e.address?.toLowerCase()]
        dailyFees.add(asset, e.args.interestPaid_, METRIC.BORROW_INTEREST)
        dailySupplySideRevenue.add(asset, e.args.interestPaid_, METRIC.BORROW_INTEREST)

        if (e.args.treasuryFeePaid_ !== undefined) {
          dailyFees.add(asset, e.args.delegateFeePaid_, METRIC.SERVICE_FEES)
          dailyFees.add(asset, e.args.treasuryFeePaid_, METRIC.SERVICE_FEES)
          dailyRevenue.add(asset, e.args.delegateFeePaid_, METRIC.SERVICE_FEES)
          dailyRevenue.add(asset, e.args.treasuryFeePaid_, METRIC.SERVICE_FEES)
        }
      })
    }

    // Fixed-term management fees are a cut of the interest above (12.5% on the pools seen), not an
    // extra charge, so they are revenue and have to come back off the supply side. The open-term
    // leg already gets this right by booking netInterest_.
    const logs_fixed_term_loan_manager_deployed = await getLogs({
      target: fixedTermLoanManagerFactory,
      eventAbi: loan_manager_deployed_event,
      fromBlock: 16155123, // Dec-11-2022, first manager
      cacheInCloud: true,
    })
    const fixed_term_loan_managers: string[] = logs_fixed_term_loan_manager_deployed.map(e => e.instance_);

    if (fixed_term_loan_managers.length) {
      const manager_assets = await options.api.multiCall({ abi: 'address:fundsAsset', calls: fixed_term_loan_managers })

      const manager_to_asset: Record<string, string> = {};
      fixed_term_loan_managers.forEach((manager, i) => {
        manager_to_asset[manager.toLowerCase()] = manager_assets[i];
      })

      const logs_management_fees = await getLogs({
        targets: fixed_term_loan_managers,
        eventAbi: management_fees_paid_event,
        entireLog: true,
        parseLog: true,
      })

      logs_management_fees.forEach((t: any) => {
        const e = t.args;
        const asset = manager_to_asset[t.address?.toLowerCase()]
        dailyRevenue.add(asset, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
        dailyRevenue.add(asset, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)

        dailySupplySideRevenue.add(asset, -Number(e.delegateManagementFee_), METRIC.BORROW_INTEREST)
        dailySupplySideRevenue.add(asset, -Number(e.platformManagementFee_), METRIC.BORROW_INTEREST)
      })
    }
  }

  const splitRevenue = () => ({
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(1 - holdersShare),
    dailyHoldersRevenue: dailyRevenue.clone(holdersShare, METRIC.TOKEN_BUY_BACK),
  })

  if (toBlock < 17372608) return splitRevenue()

  const logs_open_term_loan_manager_deployed = await getLogs({
    target: openTermLoanManagerFactory,
    eventAbi: loan_manager_deployed_event,
    fromBlock: 17372608, // May-30-2023
    cacheInCloud: true,
  })

  // const open_term_loans = logs_open_term_loan_deployed.map(e => e.instance_);
  const open_term_loan_managers = logs_open_term_loan_manager_deployed.map(e => e.instance_);

  if (open_term_loan_managers.length) {
    const loans = [...open_term_loan_managers];

    const assets = await options.api.multiCall({ abi: 'address:fundsAsset', calls: loans })

    const loanToAsset: Record<string, string> = {};
    loans.forEach((loan, i) => {
      loanToAsset[loan.toLowerCase()] = assets[i];
    })

    const logs_claim_funds_stablecoin = await getLogs({
      targets: loans,
      eventAbi: claimed_funds_distributed_event,
      entireLog: true,
      parseLog: true,
    })
    logs_claim_funds_stablecoin.forEach((t: any) => {
      const e = t.args;
      const asset = loanToAsset[t.address?.toLowerCase()];
      dailyFees.add(asset, e.netInterest_, METRIC.BORROW_INTEREST)
      dailyFees.add(asset, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
      dailyFees.add(asset, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
      dailyFees.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
      dailyFees.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)

      dailySupplySideRevenue.add(asset, e.netInterest_, METRIC.BORROW_INTEREST)

      dailyRevenue.add(asset, e.delegateManagementFee_, METRIC.MANAGEMENT_FEES)
      dailyRevenue.add(asset, e.platformManagementFee_, METRIC.MANAGEMENT_FEES)
      dailyRevenue.add(asset, e.delegateServiceFee_, METRIC.SERVICE_FEES)
      dailyRevenue.add(asset, e.platformServiceFee_, METRIC.SERVICE_FEES)

    })
  }

  let strategies: string[] = []
  if (toBlock >= 21995795) {
    const strategies_deployed = await getLogs({
      targets: [skyStrategyFactory, aaveStrategyFactory],
      eventAbi: loan_manager_deployed_event,
      fromBlock: 21995795, // Mar-07-2025
      cacheInCloud: true,
    })

    strategies = strategies_deployed.map(strategy => strategy.instance_);
  }

  if (strategies.length) {
    const strategyAssets = await options.api.multiCall({ abi: 'address:fundsAsset', calls: strategies })

    const strategies_to_asset: Record<string, string> = {};
    strategies.forEach((strategy, i) => {
      strategies_to_asset[strategy.toLowerCase()] = strategyAssets[i];
    })

    const logs_strategy_fees = await getLogs({
      targets: strategies,
      eventAbi: strategy_fees_paid_event,
      entireLog: true,
      parseLog: true
    })

    logs_strategy_fees.forEach((e: any) => {
      const asset = strategies_to_asset[e.address?.toLowerCase()]

      dailyFees.add(asset, e.args.fees, STRATEGY_FEES)
      dailyRevenue.add(asset, e.args.fees, STRATEGY_FEES)
    })
  }

  return splitRevenue()
}

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2022-01-01'
    },
    [CHAIN.OFF_CHAIN]: {
      start: '2023-08-09'
    }
  },
  methodology: {
    Fees: "Total interest and fees paid by borrowers on both fixed-term and open-term loans, including net interest, management fees, service fees, strategy fees and origination fees, plus off-chain OTC desk revenue.",
    Revenue: "Total revenue flowing to Maple protocol and delegates, including management fees, service fees, strategy fees and origination fees from both fixed-term and open-term loans.",
    ProtocolRevenue: "Revenue flowing to Maple protocol treasuries, i.e. total revenue less the share allocated to SYRUP buybacks.",
    SupplySideRevenue: "Net interest earned by liquidity providers/depositors in Maple pools from both fixed-term and open-term loan payments, after the management fee the pool takes out of that interest.",
    HoldersRevenue: "Share of revenue used to buy back SYRUP tokens: 20% from Jan 2025 (MIP-013/016), 25% from Jul 2025 (MIP-019), 10% from Jul 2026 (MIP-021).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Net interest paid by borrowers on open-term loans.',
      [METRIC.MANAGEMENT_FEES]: 'Management fees from open-term and fixed-term loans, origination fees from fixed-term loans, and off-chain OTC desk revenue, paid to protocol and delegates.',
      [METRIC.SERVICE_FEES]: 'Service fees from both fixed-term and open-term loans, paid to protocol and delegates.',
      [STRATEGY_FEES]: 'Aave/sky Strategy fees paid to protocol.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Interest distributed to liquidity providers, net of the management fee taken out of it.',
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: 'Management fees from open-term loans and origination fees from fixed-term loans.',
      [METRIC.SERVICE_FEES]: 'Service fees from both fixed-term and open-term loans.',
      [STRATEGY_FEES]: 'Aave/sky Strategy fees paid to protocol.',
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: 'Management fees share to Maple protocol. ',
      [METRIC.SERVICE_FEES]: 'Service fees share to Maple protocol.',
      [STRATEGY_FEES]: 'Aave/sky Strategy fees share to Maple protocol.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: 'Share of revenue used for SYRUP token buybacks: 20% from Jan 2025, 25% from Jul 2025 (MIP-019), 10% from Jul 2026 (MIP-021).',
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapters;
