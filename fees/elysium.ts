import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { getArbitrumNitroFeesWei } from "../helpers/arbitrumNitroFees";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Elysium (https://elysium.kinetiq.xyz, chain id 99901) is Kinetiq's Arbitrum Nitro chain (stock ArbOS, AnyTrust data
// availability) settling to HyperEVM, with HYPE as the gas token. Genesis block 1 is 2026-10-19 12:00 UTC; public mainnet
// launch was 2026-11-09, earlier days carry real early-access traffic (hundreds of distinct senders a day). `start` is
// 2026-10-21 because DefiLlama's block lookup for elysium begins at block 100 (2026-10-20 10:05 UTC); blocks 1-99 hold
// ~0.002 HYPE of fees.
//
// Fees are the balance growth of the accounts ArbOS credits fees to (helpers/arbitrumNitroFees.ts): receipts would take ~600k
// eth_getBlockReceipts a day, more than the public node (~7 req/s) can serve.
// - Network and infra fee accounts (ArbOwnerPublic): base fee plus priority fee. "On mainnet, priority fees are collected by
//   the network, not burned" (https://elysium.kinetiq.xyz/docs/blocks-fees-and-ordering); ArbOwnerPublic.getCollectTips() = true.
//   Both are the EOA 0x6cbb552855ce5eb70af49b76a8048be8e3799a05, also the L1 reward recipient, which has never sent a tx (nonce 0
//   on 2026-11-12, ~1,389 HYPE accrued).
// - The L1 pricer funds pool and the batch posters' fee collectors (ArbAggregator): the parent-chain data fee. Elysium prices it
//   at zero ("transactions pay no parent-chain data fee", same docs page; ArbGasInfo.getL1BaseFeeEstimate() = 0), but it was
//   charged before launch and for ~40 minutes on 2026-11-09 (~0.15 HYPE that day). The pool reimburses the batch poster's fee
//   collector, so counting both keeps that flow inside the tracked set.
// Checked against Σ gasUsed × effectiveGasPrice from eth_getBlockReceipts: equal to the wei over 2026-10-31 12:00-13:00 (1,398
// blocks) and block windows on 11-05, 11-09 (data fee on), 11-10 and 11-11, with ArbitrumSubmitRetryableTx (type 0x69) receipts
// left out: their gasUsed is the auto-redeem's gas, which the redeem tx (type 0x68) pays and reports itself.

const BUILDERS_SHARE_PERCENT = 25n;
const KNTQ_BUYBACK_SHARE_PERCENT = 50n;

const LABELS = {
  BUILDERS: "Gas Fees To Builders",
  BUYBACKS: "Gas Fees To KNTQ Buybacks",
  OPERATIONS: "Gas Fees To Protocol Operations",
};

const fetchFees = async (options: FetchOptions) => {
  const feesWei = await getArbitrumNitroFeesWei(options);
  const buildersWei = feesWei * BUILDERS_SHARE_PERCENT / 100n;
  const buybacksWei = feesWei * KNTQ_BUYBACK_SHARE_PERCENT / 100n;
  const operationsWei = feesWei - buildersWei - buybacksWei;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addGasToken(feesWei, METRIC.TRANSACTION_GAS_FEES);
  dailySupplySideRevenue.addGasToken(buildersWei, LABELS.BUILDERS);
  dailyRevenue.addGasToken(buybacksWei, LABELS.BUYBACKS);
  dailyRevenue.addGasToken(operationsWei, LABELS.OPERATIONS);
  dailyHoldersRevenue.addGasToken(buybacksWei, METRIC.TOKEN_BUY_BACK);
  dailyProtocolRevenue.addGasToken(operationsWei, LABELS.OPERATIONS);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchFees,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-21",
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Gas fees paid in HYPE for transactions on Elysium, base fee and priority fee, plus the small parent-chain data fee charged before the 2026-11-09 launch and briefly on launch day.",
    Revenue: "75% of Elysium gas fees: the 50% Kinetiq allocates to KNTQ buybacks and the 25% it keeps for protocol operations.",
    SupplySideRevenue: "25% of Elysium gas fees, which Kinetiq shares with the builders whose apps drive blockspace demand.",
    HoldersRevenue: "50% of Elysium gas fees, which Kinetiq allocates to buying KNTQ on the open market; the bought KNTQ is sent to the Hyperliquid Assistance Fund.",
    ProtocolRevenue: "25% of Elysium gas fees, kept by Kinetiq for protocol operations.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Gas fees paid by Elysium users, measured as the growth of the accounts ArbOS credits fees to (network and infra fee accounts, the parent-chain data fee pool and the batch poster's fee collector).",
    },
    Revenue: {
      [LABELS.BUYBACKS]: "50% of gas fees, allocated to open-market KNTQ buybacks.",
      [LABELS.OPERATIONS]: "25% of gas fees, kept for protocol operations.",
    },
    SupplySideRevenue: {
      [LABELS.BUILDERS]: "25% of gas fees, shared with builders whose apps drive blockspace demand.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "50% of gas fees, used to buy KNTQ on the open market and sent to the Hyperliquid Assistance Fund.",
    },
    ProtocolRevenue: {
      [LABELS.OPERATIONS]: "25% of gas fees, kept by Kinetiq for protocol operations.",
    },
  },
};

export default adapter;
