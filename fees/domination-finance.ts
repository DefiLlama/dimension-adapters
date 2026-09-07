// Domination Finance fees on Base. Every maker and taker fee splits in two and
// the callback emits each half as its own event: the vault's as
// VaultOpeningFeeCharged or VaultClosingFeeCharged, the treasury's as
// DevFeeCharged. Both are read, so the split is measured rather than taken from
// the 50 in DomfiPairsStorage. Liquidation margin is the vault's alone.
//
// Funding is outside dailyFees: FeesCharged.fundingFees is an int256 paid from
// the crowded side of the book to the underweight one. Price impact is a spread
// on the execution price rather than a charge.
//
// The oracle fee is 0.10 USDC per price-requiring action and goes wholly to the
// protocol. No event carries it and it is pulled inside the same USDC transfer
// as the collateral, so reading it would need a transfer diff.

import { Balances } from "@defillama/sdk";
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
const DEV_FEE =
  "event DevFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const add = async (eventAbi: string, into: Balances, metric: string) => {
    const logs = await options.getLogs({ target: CALLBACKS, eventAbi });
    for (const log of logs) into.add(ADDRESSES.base.USDC, log.amount, metric);
  };

  for (const eventAbi of [VAULT_OPENING_FEE, VAULT_CLOSING_FEE]) {
    await add(eventAbi, dailySupplySideRevenue, METRIC.TRADING_FEES);
  }
  await add(VAULT_LIQ_FEE, dailySupplySideRevenue, METRIC.LIQUIDATION_FEES);
  await add(DEV_FEE, dailyRevenue, METRIC.TRADING_FEES);

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
    Fees: "Maker and taker fees on every open and close, plus liquidation margin. Both halves of each trading fee are read from the callback, the vault's and the treasury's. Funding is excluded: it moves between longs and shorts rather than to the protocol.",
    Revenue: "The treasury's half of every maker and taker fee, from DevFeeCharged. Liquidation margin is excluded, since it goes wholly to the vault.",
    ProtocolRevenue: "Same as Revenue. DomFi has no governance token, so no share of fees reaches holders.",
    SupplySideRevenue: "The vault's half of every trading fee, plus the whole of the liquidation margin. Vault LPs are the counterparty to every trade.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Maker and taker fees, charged on collateral x leverage at open and at close, where closing is a quarter of opening on every pair.",
      [METRIC.LIQUIDATION_FEES]: "Up to 25% of collateral on a liquidation, paid to the vault.",
    },
  },
};

export default adapter;
