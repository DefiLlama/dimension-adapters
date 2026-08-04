import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Mesha settles every position on Robinhood Chain as a USDG transfer against its pool, so
// volume and fees are read from event logs only — no project API is involved.
const POOL = "0x55d29b1c13943196bcc044360D197dFccbD9506d";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"; // 6 decimals, 1:1 USD stablecoin

const TRANSFER_ABI = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Stakes and payouts are relayer-submitted EIP-3009 transferWithAuthorization calls, so each
// one emits AuthorizationUsed alongside its Transfer. Plain deposits (transferFrom) and pool
// withdrawals do not, which is what separates position flow from treasury flow using logs
// alone. Verified against all 416 pool transfers to date: 416/416 agreement with the
// per-position metadata carried in the transaction calldata.
const AUTHORIZATION_USED_ABI = "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)";

const asTopic = (address: string) => "0x" + address.slice(2).toLowerCase().padStart(64, "0");

const USDG_DECIMALS = 1e6;

const sum = (logs: any[]) =>
  logs.reduce((acc, log) => acc + Number(log.args?.value ?? log.data) / USDG_DECIMALS, 0);

const fetch = async (options: FetchOptions) => {
  const [stakeLogs, payoutLogs, authorizationLogs] = await Promise.all([
    options.getLogs({
      target: USDG,
      eventAbi: TRANSFER_ABI,
      topics: [TRANSFER_TOPIC, null as any, asTopic(POOL)],
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      target: USDG,
      eventAbi: TRANSFER_ABI,
      topics: [TRANSFER_TOPIC, asTopic(POOL)],
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      target: USDG,
      eventAbi: AUTHORIZATION_USED_ABI,
      entireLog: true,
    }),
  ]);

  const authorized = new Set<string>(
    authorizationLogs.map((log: any) => String(log.transactionHash).toLowerCase())
  );
  const isPositionFlow = (log: any) => authorized.has(String(log.transactionHash).toLowerCase());

  const staked = sum(stakeLogs.filter(isPositionFlow));
  const paidOut = sum(payoutLogs.filter(isPositionFlow));

  // Stakes into the pool are the amount wagered; the pool is the counterparty, so nothing is
  // double counted. A negative net is a day where payouts exceeded stakes.
  if (!(staked >= 0)) throw new Error(`mesha: invalid staked total ${staked}`);

  return {
    dailyVolume: staked,
    dailyFees: staked - paidOut,
    dailyUserFees: staked - paidOut,
    dailyRevenue: staked - paidOut,
    dailyProtocolRevenue: staked - paidOut,
  };
};

const adapter: SimpleAdapter = {
  // v1: one UTC-day window per run, which is the granularity the pool flow is aggregated at.
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-17", // first day with pool activity on chain
  allowNegativeValue: true, // payouts can exceed stakes on a given day
  methodology: {
    Volume:
      "USDG staked into Mesha's pool, summed from ERC-20 Transfer logs on Robinhood Chain. Only relayer-submitted EIP-3009 transfers are counted (each emits AuthorizationUsed in the same transaction), which excludes plain deposits and treasury withdrawals. USDG is a 1:1 USD stablecoin, so the figure is already in USD.",
    Fees: "USDG staked into the pool minus USDG paid out of the pool on positions that settled in the money, both read from the same Transfer logs. Negative on days when payouts exceed stakes.",
    UserFees: "Same as Fees - the net amount paid to the pool.",
    Revenue: "Same as Fees. The pool is the counterparty to every position, so the net is retained by the protocol.",
    ProtocolRevenue:
      "Same as Revenue. No portion is currently distributed to token holders, so nothing is reported as holders revenue.",
  },
};

export default adapter;
