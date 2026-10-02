import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * GDEX Spot: token swaps placed through GDEX (gdex.pro, by Gemach DAO).
 *
 * Solana: every swap carries a platform fee of 1% of its SOL leg, paid in the swap transaction itself as a native
 * SOL transfer from the user's wallet to the GDEX Solana treasury. SOL withdrawals out of a GDEX wallet pay
 * 0.1% (1% when bridging) to the same treasury the same way. Fees are measured as native SOL received by it;
 * every sender seen in a decode of recent history (2026-05-29 to 2026-10-01) is a user wallet.
 *
 * EVM: swaps are routed through the KyberSwap aggregator (MetaAggregationRouterV2) with a 1% platform fee
 * (feeAmount 100 bps) and the chain's GDEX treasury as fee receiver. The router pays the fee to the treasury inside
 * the swap transaction and emits a `Fee` event naming the recipients and amounts, so fees are read from those events:
 * only the amounts paid to the GDEX treasury are counted. The fee is taken in the native coin (input on buys,
 * output on sells); a few early swaps paid it in an ERC-20 and are counted in that token.
 * Not tracked on EVM, because no event records them (they are plain native transfers, only visible in traces):
 *  - fees collected by GDEX's own router before the switch to KyberSwap (2024-06 to 2025-03);
 *  - the 1% fee on native transfers out of a GDEX wallet, paid through Multicall3 `aggregate3Value`;
 *  - the bridge fee, a separate native transfer from the user's wallet.
 *
 * Only dailyFees is reported. The same treasuries also pay out GDEX's referral rewards (a supply-side cost; the
 * configured referral wallet is the treasury itself on every chain), claimed by referrers at their own pace, so
 * retained revenue cannot be separated on-chain from the inflow. skipBreakdownValidation is set for this reason,
 * rather than aliasing gross fees to revenue.
 *
 * Hyperliquid perps are listed separately as gdex-perps (builder code).
 */

// GDEX Solana treasury, the fee receiver for every GDEX swap on Solana. Sample swap paying the 1% fee:
// https://solscan.io/tx/5gvK61n74yxRFzAcDuac7hqmap6RfFF1nVVpDmairmikXwp4QcDXpTX8wS3yogZRq4sE1m8TVpeFTKmbLwacMWgr
const SOL_TREASURY = "HLY8UNd7jmvtJuAz3q2MgJ7qF3QedDvoeUbnK5FZsUxS";

// KyberSwap MetaAggregationRouterV2, same address on every chain below. It is the contract that transfers the
// platform fee to the treasury and emits the Fee event (verified source: https://arbiscan.io/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code).
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const KYBER_FEE_EVENT = "event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)";
// KyberSwap's placeholder for the chain's native coin in the Fee event.
const KYBER_NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// Per chain: GDEX treasury (fee receiver set on every KyberSwap route request) and start = first KyberSwap fee
// paid to it. Sample swap per chain, with the Fee event paying the treasury.
// Other GDEX EVM chains are left out because their treasuries show no fee activity this adapter can verify:
//  - Optimism: four KyberSwap fees in April 2025, under $0.01 in total.
//  - BSC, Sonic, Berachain, Fraxtal, Nibiru: treasury balance unchanged for 6+ months, no KyberSwap fees found.
// Base's fees before 2025-01 and most Robinhood Chain fees (Pons launch curves) are plain native transfers with no
// event, so on those chains only the KyberSwap-routed fees are counted.
const evmConfig: Record<string, { treasury: string; start: string }> = {
  // https://etherscan.io/tx/0xb683ef8fe7c29f50f02460dbb681dc322bb67f99b5ac7b267a3b3bc96a6f0d7f
  [CHAIN.ETHEREUM]: { treasury: "0x1B24c481BB4e43E6b8d16254C267BBc702E16dc2", start: "2025-03-31" },
  // https://arbiscan.io/tx/0x2eeeb831133e9ebb775c1dc99c31d5ac94fb8895dbc85c7a0347762694b858b3
  [CHAIN.ARBITRUM]: { treasury: "0x64C27c24dD567845004C439100189770119c6B25", start: "2025-03-31" },
  // https://basescan.org/tx/0xab0e1070e5a0c46f59db2bb74e57b884f65f1f6d6f1e9cc13e8763bcb44e71de
  [CHAIN.BASE]: { treasury: "0x64C27c24dD567845004C439100189770119c6B25", start: "2025-01-20" },
  // Robinhood Chain tx 0x12b5042ff6e9c091db2d1d4040cd858f690ef883495c164b18a060f418733ae8 (block 68455809)
  [CHAIN.ROBINHOOD]: { treasury: "0x1Bd38cf3155FCB4719592ae5DD5c966e9736D9D9", start: "2026-09-21" },
};

const chainConfig: Record<string, { start: string }> = {
  // First transaction into the Solana treasury.
  [CHAIN.SOLANA]: { start: "2024-05-27" },
  ...evmConfig,
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.SOLANA) {
    const fees = await getSolanaReceived({ options, target: SOL_TREASURY, mints: [ADDRESSES.solana.SOL] });
    dailyFees.addBalances(fees, METRIC.TRADING_FEES);
    return { dailyFees };
  }

  const treasury = evmConfig[options.chain].treasury.toLowerCase();
  const feeLogs = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_FEE_EVENT });
  for (const log of feeLogs) {
    const token = log.token.toLowerCase() === KYBER_NATIVE ? ADDRESSES.null : log.token;
    log.recipients.forEach((recipient: string, i: number) => {
      if (recipient.toLowerCase() !== treasury) return;
      // With isBps the amounts are basis points of totalAmount (GDEX sends 100 = 1%), otherwise token amounts.
      const amount = log.isBps ? (BigInt(log.totalAmount) * BigInt(log.amounts[i])) / 10000n : BigInt(log.amounts[i]);
      dailyFees.add(token, amount, METRIC.TRADING_FEES);
    });
  }
  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  // Referral payouts leave the same treasuries and cannot be separated from the fee inflow on-chain,
  // so no revenue / supply-side split is derived. Only gross dailyFees is reported.
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Platform fees paid by GDEX users. Solana: received in SOL by the GDEX treasury, 1% of the SOL side of each swap and 0.1% on SOL withdrawals (1% when bridging). EVM chains: the 1% swap fee paid to the GDEX treasury by the KyberSwap router GDEX routes swaps through; EVM transfer and bridge fees are not included.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "1% platform fee on GDEX swaps (Solana: plus 0.1% on SOL withdrawals, 1% when bridging), received by the GDEX treasury: in SOL on Solana, and on EVM chains as the KyberSwap router fee paid to the treasury, mostly in the native coin.",
    },
  },
};

export default adapter;
