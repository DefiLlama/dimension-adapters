import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { Interface } from 'ethers';
import { CHAIN } from '../helpers/chains';
import { addToken, collector, engines, feePaid, settled } from '../helpers/aggregators/route';

// Verified manager binds this escrow and ROUTE pool hook in escrow()/poolKey():
// https://repo.sourcify.dev/4663/0xDa5790345FD25878e5186EBd98823814188AcfBE
const creatorEscrow = '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e';
const creatorManager = '0xda5790345fd25878e5186ebd98823814188acfbe';
const creatorHook = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
// https://robinhoodchain.blockscout.com/tx/0x00a45c5d3843cd51e9e9b2bd825f915a285afb6b889e04c43266b2fc3c1642aa
const creatorManagerDeploymentBlock = 59844471;
const credited = 'event Credited(address indexed recipient,address indexed depositor,uint256 amount)';
// Filter the shared escrow at the RPC/indexer as well as validating decoded args.
const creatorTopics = new Interface([credited]).encodeFilterTopics('Credited', [creatorManager, creatorHook]) as string[];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const oldFees = await options.getLogs({ targets: engines, eventAbi: feePaid });
  const currentFees = await options.getLogs({ target: collector, eventAbi: settled });
  for (const log of oldFees) {
    addToken(dailyFees, log.token, log.feeAmount.toString(), 'Swap Fees');
    addToken(dailyRevenue, log.token, log.feeAmount.toString(), 'Swap Fees To Route');
  }
  for (const log of currentFees) {
    addToken(dailyFees, log.tokenOut, log.feeAmount.toString(), 'Swap Fees');
    addToken(dailyRevenue, log.tokenOut, log.feeAmount.toString(), 'Swap Fees To Route');
  }
  // Revenue belongs to Route; buying protocol-owned LP is not a payment to outside LPs.
  // Do not add receiver conversions/escrow claims again. The mixed-source worker cannot
  // attribute realized holder distributions to swap fees alone; omit that metric, not zero.
  // Creator income is external income, not an additional aggregator surcharge.
  // Only the current manager's history is verified; omit earlier unknown income.
  let dailyOtherIncome;
  if (await options.getToBlock() >= creatorManagerDeploymentBlock) {
    dailyOtherIncome = options.createBalances();
    const credits = await options.getLogs({ target: creatorEscrow, eventAbi: credited, topics: creatorTopics });
    for (const log of credits) {
      if (log.recipient.toLowerCase() !== creatorManager || log.depositor.toLowerCase() !== creatorHook) continue;
      dailyOtherIncome.addGasToken(log.amount.toString(), 'ROUTE Creator Income');
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue: 0, dailyOtherIncome };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-09-05',
  methodology: {
    Fees: 'Actual Route output-token swap fees from historical FeePaid and current Settled events; excludes pool/provider fees, gas, creator fees and private transfers.',
    Revenue: 'All collected Route swap fees accrue to Route-controlled recipients; later conversions and allocations are not counted again.',
    ProtocolRevenue: 'Swap fees retained by Route at collection, before subsequent capital allocations; excludes unverified holder distributions.',
    SupplySideRevenue: 'No portion of this aggregator fee is paid to external liquidity providers or referrers; protocol-owned liquidity is a capital allocation.',
    OtherIncome: 'Native ETH creator income credited by the ROUTE pool hook to the current Route manager, from its deployment at block 59844471; earlier recipient history is not covered. Excludes swap-fee receiver deposits, donations, migrations and subsequent claims.',
  },
  breakdownMethodology: {
    Fees: { 'Swap Fees': 'Actual emitted fee amounts, not an assumed fee rate multiplied by volume; includes historical fees and the September 11, 2026 tiered collector.' },
    Revenue: { 'Swap Fees To Route': 'Swap fees received by Route treasury or its fee receiver, before subsequent buybacks and protocol-owned liquidity allocations.' },
    ProtocolRevenue: { 'Swap Fees To Route': 'Route-retained swap fees at collection; subsequent conversions and escrow claims are not additional revenue.' },
    OtherIncome: { 'ROUTE Creator Income': 'Actual escrow credits from the verified ROUTE creator hook to the current Route manager; counted at credit, not again on claim, conversion or allocation. Separate from aggregator fees and revenue.' },
  },
};
export default adapter;
