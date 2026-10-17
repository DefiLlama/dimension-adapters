import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";

// Papertrade liquidations are a hard bust: the full isolated margin is forfeited and margin cannot be added after open
// (https://docs.papertrade.xyz/#/learn/liquidations). The Liquidated event carries no margin field, but the 2% liquidation
// fee is charged on that margin, so margin = (stakerFee + devFee) / 0.02. Checked against the open event's margin on
// 36 of 36 liquidated positions.
const EXCHANGE = "0x6cd5661646289fb6e65ea5c032310fded797d0a2"; // HyperEVM
const LIQUIDATED = "event Liquidated(uint256 indexed positionId, address indexed user, uint64 markPrice, uint64 bustPrice, bool fromQueuedBalance, uint256 stakerFee, uint256 devFee)";

const fetch = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.HYPERLIQUID), getBlock(options.toTimestamp, CHAIN.HYPERLIQUID)]);
  const logs = await sdk.getEventLogs({ chain: CHAIN.HYPERLIQUID, target: EXCHANGE, fromBlock, toBlock, eventAbi: LIQUIDATED, onlyArgs: true });

  let feeWei = 0n;
  for (const log of logs) {
    const fee = BigInt(log.stakerFee) + BigInt(log.devFee);
    // the fee is waived while the payout queue is active and for positions opened from queued balance, so the margin
    // of those liquidations cannot be derived from it; fail rather than undercount
    if (fee === 0n) throw new Error(`papertrade: liquidation of position ${log.positionId} carries no fee, margin cannot be derived`);
    feeWei += fee;
  }

  const dailyCollateralLiquidated = options.createBalances();
  dailyCollateralLiquidated.addUSDValue(Number(feeWei * 50n / 10n ** 12n) / 1e6); // fee words are USD with 18 decimals, margin = fee * 50
  return { dailyCollateralLiquidated };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN], // same as fees/papertrade.ts: positions are synthetic bets against the house, events are read from HyperEVM
  start: "2026-10-09",
  methodology: {
    CollateralLiquidated: "Margin forfeited by liquidated BTC and ETH positions, in USD. Liquidation forfeits the full isolated margin, derived from the 2% liquidation fee in the Exchange contract's Liquidated events. Liquidated notional is not reported, for the same reason volume is not listed (up to 1000x synthetic leverage).",
  },
};

export default adapter;
