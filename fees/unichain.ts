import { CHAIN } from "../helpers/chains";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";
import { getVaultCountersAccruedWei } from "../helpers/ethereum-l2";
import { METRIC } from "../helpers/metrics";

const SEQUENCER_FEE_VAULT = '0x4200000000000000000000000000000000000011';
const L1_FEE_VAULT = '0x420000000000000000000000000000000000001a';
const BASE_FEE_VAULT = '0x4200000000000000000000000000000000000019';

const FEE_SPLITTER_LIVE_FROM = 1766966400;
const BASIS_POINT_SCALE = 1000n;
const GROSS_REVENUE_SHARE = 25n;
const NET_REVENUE_SHARE = 150n;

const L1_DATA_FEES = 'L1 Data Fees';
const NET_FEE_REVENUE = 'Net Fee Revenue';
const OPTIMISM_SUPERCHAIN_SHARE = 'Optimism Superchain Share';

const fetch = async (options: FetchOptions) => {
  if (options.startOfDay < FEE_SPLITTER_LIVE_FROM) {
    const blockscoutAdapter = blockscoutFeeAdapter2(CHAIN.UNICHAIN)
    const { dailyFees } = await (blockscoutAdapter.adapter as any)[options.chain].fetch(options)
    return { dailyFees, dailyRevenue: 0, dailyHoldersRevenue: 0, dailyProtocolRevenue: 0 }
  }

  const [netFees, l1DataFees] = await Promise.all([
    getVaultCountersAccruedWei(options, [SEQUENCER_FEE_VAULT, BASE_FEE_VAULT]),
    getVaultCountersAccruedWei(options, [L1_FEE_VAULT]),
  ]);

  const optimismGrossShare = (netFees + l1DataFees) * GROSS_REVENUE_SHARE / BASIS_POINT_SCALE;
  const optimismNetShare = netFees * NET_REVENUE_SHARE / BASIS_POINT_SCALE;
  const optimismShareBps = optimismGrossShare > optimismNetShare ? GROSS_REVENUE_SHARE : NET_REVENUE_SHARE;
  const netFeeRevenue = netFees * (BASIS_POINT_SCALE - optimismShareBps) / BASIS_POINT_SCALE;

  const dailyFees = options.createBalances()
  dailyFees.addGasToken(netFees.toString(), METRIC.TRANSACTION_GAS_FEES)
  dailyFees.addGasToken(l1DataFees.toString(), L1_DATA_FEES)

  const dailyRevenue = options.createBalances()
  dailyRevenue.addGasToken(netFeeRevenue.toString(), NET_FEE_REVENUE)

  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addGasToken((netFees - netFeeRevenue).toString(), OPTIMISM_SUPERCHAIN_SHARE)
  dailySupplySideRevenue.addGasToken(l1DataFees.toString(), L1_DATA_FEES)

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue: dailyRevenue, dailyProtocolRevenue: 0 }
}

const netFeeRevenueDescription = "85% of the sequencer and base fees paid by users on Unichain (97.5% when L1 data fees are over 5x those fees), sent to the Net Fee Splitter; Optimism's Superchain share and L1 data fees are excluded.";
const optimismShareDescription = "Optimism's Superchain share of the sequencer and base fees paid by users on Unichain: 15%, or 2.5% when L1 data fees are over 5x those fees.";
const l1DataFeesDescription = 'L1 data fees paid by users on Unichain to cover posting transaction data to Ethereum.';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.UNICHAIN]: {
      fetch,
    }
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users on Unichain, including L1 data fees.',
    Revenue: netFeeRevenueDescription,
    SupplySideRevenue: "L1 data fees paid by users on Unichain, plus Optimism's Superchain share of the sequencer and base fees (15%, or 2.5% when L1 data fees are over 5x those fees).",
    HoldersRevenue: "85% of the sequencer and base fees paid by users on Unichain (97.5% when L1 data fees are over 5x those fees), paid out by the Net Fee Splitter to its recipients; Optimism's Superchain share and L1 data fees are excluded.",
    ProtocolRevenue: 'Unichain keeps none of the transaction fees paid by users.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Sequencer and base fees paid by users on Unichain for L2 execution.',
      [L1_DATA_FEES]: l1DataFeesDescription,
    },
    Revenue: {
      [NET_FEE_REVENUE]: netFeeRevenueDescription,
    },
    SupplySideRevenue: {
      [OPTIMISM_SUPERCHAIN_SHARE]: optimismShareDescription,
      [L1_DATA_FEES]: l1DataFeesDescription,
    },
    HoldersRevenue: {
      [NET_FEE_REVENUE]: netFeeRevenueDescription,
    },
  },
}

export default adapter;
