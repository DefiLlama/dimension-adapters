// Each trading fee splits in two and the callback emits both halves, the vault's
// and the treasury's; the oracle fee is the protocol's and liquidation margin the
// vault's. Funding is a signed transfer between traders and no part of fees.

import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

const CALLBACKS = "0x837a6E61C123c6e7cDfff2219A46898D0415343F";
const TRADING = "0x7447cb5350a096364A13bEAf77916dfB35db9445";

const VAULT_OPENING_FEE =
  "event VaultOpeningFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)";
const VAULT_CLOSING_FEE =
  "event VaultClosingFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)";
const VAULT_LIQ_FEE =
  "event VaultLiqFeeCharged(uint256 indexed orderId, uint256 indexed tradeId, address indexed trader, uint256 amount)";
const DEV_FEE =
  "event DevFeeCharged(uint256 indexed tradeId, address indexed trader, uint256 amount)";
const ORACLE_FEE =
  "event OracleFeeCharged(address indexed trader, uint16 pairIndex, uint256 oracleFee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const add = async (target: string, eventAbi: string, field: string,
                     into: Balances, metric: string) => {
    const logs = await options.getLogs({ target, eventAbi });
    for (const log of logs) into.add(ADDRESSES.base.USDC, log[field], metric);
  };

  for (const eventAbi of [VAULT_OPENING_FEE, VAULT_CLOSING_FEE]) {
    await add(CALLBACKS, eventAbi, "amount", dailySupplySideRevenue, METRIC.TRADING_FEES);
  }
  await add(CALLBACKS, VAULT_LIQ_FEE, "amount", dailySupplySideRevenue,
            METRIC.LIQUIDATION_FEES);
  // one trading fee, charged once; where it went is the split below
  await add(CALLBACKS, DEV_FEE, "amount", dailyRevenue, METRIC.TRADING_FEES);
  // charged by DomfiTrading when the order is queued, not by the callback
  await add(TRADING, ORACLE_FEE, "oracleFee", dailyRevenue, "Oracle Fee");

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
  pullHourly: true,
  chains: [CHAIN.BASE],
  start: "2026-06-23",
  methodology: {
    Fees: "Maker and taker fees on every open and close, liquidation margin, and the oracle fee charged once per price-requiring action. Both halves of each trading fee are read from the callback, the vault's and the treasury's. Funding is excluded: it moves between longs and shorts rather than to the protocol.",
    Revenue: "The treasury's half of every maker and taker fee, from DevFeeCharged, plus the oracle fee from OracleFeeCharged. Liquidation margin is excluded, since it goes wholly to the vault.",
    ProtocolRevenue: "The treasury's half of every maker and taker fee, from DevFeeCharged, plus the oracle fee from OracleFeeCharged.",
    SupplySideRevenue: "The vault's half of every trading fee, plus the whole of the liquidation margin. Vault LPs are the counterparty to every trade.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Maker and taker fees, charged on collateral x leverage at open and at close, where closing is a quarter of opening on every pair.",
      [METRIC.LIQUIDATION_FEES]: "Up to 25% of collateral on a liquidation, paid to the vault.",
      "Oracle Fee": "The oracle fee, from OracleFeeCharged on DomfiTrading, which charges it when the order is queued. DomfiPairsStorage sets the rate and returns a flat 0.10 USDC on every pair.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "The treasury's half of every maker and taker fee, from DevFeeCharged.",
      "Oracle Fee": "The oracle fee, kept by the protocol, from OracleFeeCharged.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "The treasury's half of every maker and taker fee, from DevFeeCharged.",
      "Oracle Fee": "The oracle fee, kept by the protocol, from OracleFeeCharged.",
    },
    SupplySideRevenue: {
      [METRIC.TRADING_FEES]: "The vault's half of every maker and taker fee, from VaultOpeningFeeCharged and VaultClosingFeeCharged.",
      [METRIC.LIQUIDATION_FEES]: "The liquidation fees, from VaultLiqFeeCharged, paid to vault LPs.",
    },
  },
};

export default adapter;
