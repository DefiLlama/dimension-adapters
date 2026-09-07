// Domination Finance fees on Base. The docs put the split at 50% vault and 50%
// protocol on every maker and taker fee, and the callback emits only the vault
// leg, so the protocol leg is the same amount again and the total is twice what
// the events carry.
//
// Two things are deliberately outside dailyFees. Funding is a payment from the
// crowded side of the book to the underweight side, so FeesCharged.fundingFees
// is signed and nets to zero across traders. Price impact is a spread on the
// execution price rather than a charge, and the docs say it is not collected.
//
// The oracle fee is 0.10 USDC per price-requiring action and goes wholly to the
// protocol. It is not read here: no event carries it, and it is pulled inside
// the same USDC transfer as the collateral, so counting it would need a transfer
// diff rather than a log.

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

const CALLBACKS = "0x837a6E61C123c6e7cDfff2219A46898D0415343F";

const VAULT_OPENING_FEE =
  "event VaultOpeningFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)";
const VAULT_CLOSING_FEE =
  "event VaultClosingFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)";
const VAULT_LIQ_FEE =
  "event VaultLiqFeeCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const [eventAbi, metric] of [
    [VAULT_OPENING_FEE, METRIC.TRADING_FEES],
    [VAULT_CLOSING_FEE, METRIC.TRADING_FEES],
  ] as const) {
    const logs = await options.getLogs({ target: CALLBACKS, eventAbi });
    for (const log of logs) {
      // the vault leg is what the event carries, and the treasury takes the same
      dailySupplySideRevenue.add(ADDRESSES.base.USDC, log.amount, metric);
      dailyRevenue.add(ADDRESSES.base.USDC, log.amount, METRIC.PROTOCOL_FEES);
    }
  }

  const liquidations = await options.getLogs({ target: CALLBACKS, eventAbi: VAULT_LIQ_FEE });
  for (const log of liquidations) {
    // liquidation margin is the vault's alone, so no treasury leg is added
    dailySupplySideRevenue.add(ADDRESSES.base.USDC, log.amount, METRIC.LIQUIDATION_FEES);
  }

  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-06-23",
  methodology: {
    Fees: "Maker and taker fees on every open and close, plus liquidation margin. The callback emits the vault's half of each trading fee, and the protocol takes the other half, so the total is twice the emitted amount. Funding is excluded: it moves between longs and shorts rather than to the protocol.",
    Revenue: "The protocol's half of every maker and taker fee. Liquidation margin is excluded, since it goes wholly to the vault.",
    ProtocolRevenue: "Same as Revenue. DomFi has no governance token, so no share of fees reaches holders.",
    SupplySideRevenue: "The vault's half of every trading fee, plus the whole of the liquidation margin. Vault LPs are the counterparty to every trade.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Maker and taker fees, charged on collateral x leverage at open and at close, where closing is a quarter of opening on every pair.",
      [METRIC.PROTOCOL_FEES]: "The treasury's half of the trading fees.",
      [METRIC.LIQUIDATION_FEES]: "Up to 25% of collateral on a liquidation, paid to the vault.",
    },
  },
};

export default adapter;
