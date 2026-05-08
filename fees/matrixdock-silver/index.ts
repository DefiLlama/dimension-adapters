import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Matrixdock XAGm sources:
// XAGm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/faq
// XAGm token design / reconcileSupply fee model: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/token-design
// XAGm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/smart-contract/contract-address

// XAGm Ethereum MTokenMain address is from the Matrixdock contract-address docs.
const XAGM = "0x123ffe0a3C62878dcbee2742227dc8990058d9E1";
const XAGM_MINTER = "0xdA29ad84566C3bfdEe6009F6c0f6bEb6686A71A2";
// XAGm FAQ: redemption fee is 0.50%.
const XAGM_REDEMPTION_FEE_BPS = 50;
const BPS = 10_000n;
const EVENTS = {
  reconcileSupply: "event ReconcileSupply(uint64 lastReconcileTime, uint64 thisReconcileTime, uint256 amount)",
  redeem: "event Redeem(address indexed customer, uint256 amount, bytes data)",
  redeemRequest: "event RedeemRequest(address indexed transferredToken, address indexed forToken, address indexed requestor, address pool, uint256 amount, uint256 preprice, uint256 slippage, bytes extraData)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const fromBlock = await options.getFromBlock();

  const reconcileSupplyLogs = await options.getLogs({
    target: XAGM,
    eventAbi: EVENTS.reconcileSupply,
    fromBlock,
  });

  for (const log of reconcileSupplyLogs) {
    const amount = BigInt(log.amount.toString());
    dailyFees.add(XAGM, amount, METRIC.MANAGEMENT_FEES);
    dailyRevenue.add(XAGM, amount, METRIC.MANAGEMENT_FEES);
  }

  const redeemRequestLogs = await options.getLogs({
    target: XAGM_MINTER,
    eventAbi: EVENTS.redeemRequest,
    fromBlock,
  });
  const redeemLogs = await options.getLogs({
    target: XAGM,
    eventAbi: EVENTS.redeem,
    fromBlock,
  });

  for (const log of redeemRequestLogs.concat(redeemLogs)) {
    const fee = BigInt(log.amount.toString()) * BigInt(XAGM_REDEMPTION_FEE_BPS) / BPS;
    dailyFees.add(XAGM, fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.add(XAGM, fee, METRIC.MINT_REDEEM_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-03-09",
    },
  },
  methodology: {
    Fees: "XAGm custody fees minted by reconcileSupply and XAGm redemption fees.",
    Revenue: "XAGm custody and redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "XAGm custody and redemption fees accounted as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees from ReconcileSupply events.",
      [METRIC.MINT_REDEEM_FEES]: "0.50% fee charged on XAGm redemption orders.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fees from ReconcileSupply events.",
      [METRIC.MINT_REDEEM_FEES]: "0.50% XAGm redemption fee from minter RedeemRequest events.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "XAGm custody fee accounted as protocol revenue.",
      [METRIC.MINT_REDEEM_FEES]: "XAGm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
