import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Matrixdock XAUm sources:
// XAUm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/faq
// XAUm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/smart-contract/contract-address

// XAUm Ethereum MTokenMain address is from the Matrixdock contract-address docs.
const XAUM = "0x2103E845C5E135493Bb6c2A4f0B8651956eA8682";
// XAUm FAQ: redemption fee is 0.25%.
const XAUM_REDEMPTION_FEE_BPS = 25;
const BPS = 10_000n;
const XAUM_PRICE_START_TIMESTAMP = 1733184000;
const EVENTS = {
  redeem: "event Redeem(address indexed customer, uint256 amount, bytes data)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const redeemLogs = await options.getLogs({
    target: XAUM,
    eventAbi: EVENTS.redeem,
    fromBlock: await options.getFromBlock(),
  });

  for (const log of redeemLogs) {
    const fee = BigInt(log.amount.toString()) * BigInt(XAUM_REDEMPTION_FEE_BPS) / BPS;
    if (options.toTimestamp < XAUM_PRICE_START_TIMESTAMP) {
      dailyFees.addCGToken("pax-gold", Number(fee) / 1e18, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.addCGToken("pax-gold", Number(fee) / 1e18, METRIC.MINT_REDEEM_FEES);
    } else {
      dailyFees.add(XAUM, fee, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.add(XAUM, fee, METRIC.MINT_REDEEM_FEES);
    }
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
      start: "2024-08-27",
    },
  },
  methodology: {
    Fees: "XAUm redemption fees.",
    Revenue: "XAUm redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "XAUm redemption fees accounted as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MINT_REDEEM_FEES]: "0.25% fee charged on XAUm redemption orders.",
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "0.25% XAUm redemption fee from Redeem events.",
    },
    ProtocolRevenue: {
      [METRIC.MINT_REDEEM_FEES]: "XAUm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
