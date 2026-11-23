import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

const VIBE_SAFE = "0xa679568586ab40ce14b187bc1993dac1ba1372c6";

const FEES_DISPERSED = "event BoosterTokenFeesDispersed(uint256 ownerFee, uint256 protocolFee, address owner, address protocolFeeRecipient, uint256 referrerFee, uint256 originReferrerFee, address referrer, address originReferrer)";
const POSITION_FEES_COLLECTED = "event PositionFeesCollected(uint256 indexed positionId, uint256 amount0, uint256 amount1)";
const FEES_COLLECTED = "event FeesCollected(uint256 indexed dropId, address indexed token, uint256 creatorAmount, uint256 treasuryAmount)";

const SAFE_RECEIVED = "event SafeReceived(address indexed sender, uint256 value)";
const TREASURY = "function treasury() view returns (address)";

const LABELS = {
  TRADING_PROTOCOL: "Trading Fees To Protocol",
  TRADING_CREATORS: "Trading Fees To Creators",
  TRADING_REFERRERS: "Trading Fees To Referrers",
  LP_PROTOCOL: "LP Fees To Protocol",
  LP_CREATORS: "LP Fees To Creators",
};

const lower = (a: string) => a.toLowerCase();

const getFeeLogs = (options: FetchOptions, eventAbi: string) =>
  options.getLogs({ noTarget: true, eventAbi, entireLog: true, parseLog: true, allowParseFailure: true });

const ownLogs = (logs: any[], emitters: Set<string>) => logs.filter((log) => {
  if (!emitters.has(lower(log.address))) return false;
  if (!log.args) throw new Error(`vibe-market: undecodable log from ${log.address} in ${log.transactionHash}`);
  return true;
});

const paymentKey = (txHash: string, payer: string) => `${lower(txHash)}:${lower(payer)}`;

type BaseFee = { key: string, kind: "trade" | "lp", toSafe: bigint, toOthers: Record<string, bigint> };

// A coin's fees count only when the Safe received the protocol's share from that coin in the same transaction.
function parseBaseFee(log: any, kind: "trade" | "lp", weth: string): BaseFee | undefined {
  const key = paymentKey(log.transactionHash, log.address);
  if (kind === "trade") {
    const { ownerFee, protocolFee, protocolFeeRecipient, referrerFee, originReferrerFee, referrer, originReferrer } = log.args;
    if (lower(protocolFeeRecipient) !== VIBE_SAFE) return;
    const fee = { key, kind, toSafe: BigInt(protocolFee), toOthers: { [LABELS.TRADING_CREATORS]: BigInt(ownerFee), [LABELS.TRADING_REFERRERS]: 0n } };
    for (const [amount, recipient] of [[referrerFee, referrer], [originReferrerFee, originReferrer]]) {
      if (lower(recipient) === VIBE_SAFE) fee.toSafe += BigInt(amount);
      else fee.toOthers[LABELS.TRADING_REFERRERS] += BigInt(amount);
    }
    return fee;
  }
  const wethFees = BigInt(lower(log.address) < weth ? log.args.amount1 : log.args.amount0);
  return { key, kind, toSafe: wethFees / 2n, toOthers: { [LABELS.LP_CREATORS]: wethFees - wethFees / 2n } };
}

async function fetchBase(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const weth = lower(ADDRESSES.base.WETH);

  const [feeLogs, lpLogs, safeReceipts] = await Promise.all([
    getFeeLogs(options, FEES_DISPERSED),
    getFeeLogs(options, POSITION_FEES_COLLECTED),
    options.getLogs({ target: VIBE_SAFE, eventAbi: SAFE_RECEIVED, entireLog: true, parseLog: true }),
  ]);

  const received = new Map<string, bigint>();
  for (const log of safeReceipts) {
    const key = paymentKey(log.transactionHash, log.args.sender);
    received.set(key, (received.get(key) ?? 0n) + BigInt(log.args.value));
  }

  const fees: BaseFee[] = [];
  for (const [logs, kind] of [[feeLogs, "trade"], [lpLogs, "lp"]] as const) {
    for (const log of logs) {
      if (!log.args) {
        if (received.has(paymentKey(log.transactionHash, log.address))) throw new Error(`vibe-market: undecodable log from ${log.address} in ${log.transactionHash}`);
        continue;
      }
      const fee = parseBaseFee(log, kind, weth);
      if (fee) fees.push(fee);
    }
  }

  const owed = new Map<string, bigint>();
  for (const fee of fees) owed.set(fee.key, (owed.get(fee.key) ?? 0n) + fee.toSafe);

  for (const fee of fees) {
    const total = fee.toSafe + Object.values(fee.toOthers).reduce((a, b) => a + b, 0n);
    // The protocol's cut is at least 20% of a coin's fee (40/20/20/20 split before August 2025, 40/40/10/10 after)
    if (fee.toSafe === 0n || total > 5n * fee.toSafe || (received.get(fee.key) ?? 0n) < owed.get(fee.key)!) continue;
    if (fee.kind === "trade") {
      dailyFees.addGasToken(total, METRIC.TRADING_FEES);
      dailyRevenue.addGasToken(fee.toSafe, LABELS.TRADING_PROTOCOL);
      for (const [label, amount] of Object.entries(fee.toOthers)) dailySupplySideRevenue.addGasToken(amount, label);
    } else {
      dailyFees.add(weth, total, METRIC.LP_FEES);
      dailyRevenue.add(weth, fee.toSafe, LABELS.LP_PROTOCOL);
      for (const [label, amount] of Object.entries(fee.toOthers)) dailySupplySideRevenue.add(weth, amount, label);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

async function fetchRobinhood(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await getFeeLogs(options, FEES_COLLECTED);
  const emitters = [...new Set(logs.map((l: any) => lower(l.address)))];
  const treasuries = emitters.length ? await options.api.multiCall({ abi: TREASURY, calls: emitters, permitFailure: true }) : [];
  const factories = new Set(emitters.filter((_, i) => treasuries[i] && lower(treasuries[i]) === VIBE_SAFE));

  const weth = lower(ADDRESSES.robinhood.WETH);
  for (const log of ownLogs(logs, factories)) {
    if (lower(log.args.token) !== weth) continue;
    const { creatorAmount, treasuryAmount } = log.args;
    dailyFees.add(weth, creatorAmount + treasuryAmount, METRIC.TRADING_FEES);
    dailyRevenue.add(weth, treasuryAmount, LABELS.TRADING_PROTOCOL);
    dailySupplySideRevenue.add(weth, creatorAmount, LABELS.TRADING_CREATORS);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

const methodology = {
  Fees: "Trading fees paid on vibe.market card coins: the ETH fee on every Base card coin trade, the WETH side of the Uniswap pool fees earned by graduated Base card coins, and the WETH fees collected by vibe.market's Robinhood Chain pack markets. Fees paid in $SPORTS or in card coins are not priced and are excluded.",
  Revenue: "The protocol's share of trading fees (on Base 40% of each trade's fee since August 2025, 20% before, plus the referrer shares of trades that name no referrer), and half of the graduated Base card coins' pool fees.",
  ProtocolRevenue: "The protocol's share of trading fees, paid to the vibe.market Safe.",
  SupplySideRevenue: "Trading fees paid to pack creators and to referrers, and the creators' half of the graduated Base card coins' pool fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees charged on card coin and pack trades: the ETH fee on each Base card coin trade (7.5% since 2025-07-22, 5% before), and the WETH fees collected by the Robinhood Chain pack markets (pack trading fees and parent-pool fees).",
    [METRIC.LP_FEES]: "WETH side of the 1% Uniswap v3 fees earned by the liquidity of graduated Base card coins.",
  },
  Revenue: {
    [LABELS.TRADING_PROTOCOL]: "Protocol share of trading fees, including Base referrer shares that fall back to the protocol when a trade names no referrer.",
    [LABELS.LP_PROTOCOL]: "Half of the graduated Base card coins' pool fees, paid to the protocol.",
  },
  ProtocolRevenue: {
    [LABELS.TRADING_PROTOCOL]: "Protocol share of trading fees, paid to the vibe.market Safe.",
    [LABELS.LP_PROTOCOL]: "Half of the graduated Base card coins' pool fees, paid to the vibe.market Safe.",
  },
  SupplySideRevenue: {
    [LABELS.TRADING_CREATORS]: "Share of trading fees paid to the creator of each pack.",
    [LABELS.TRADING_REFERRERS]: "Share of Base trading fees paid to the referrer and origin referrer named on a trade.",
    [LABELS.LP_CREATORS]: "Half of the graduated Base card coins' pool fees, paid to the pack creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: { fetch: fetchBase, start: "2025-06-21" },
    [CHAIN.ROBINHOOD]: { fetch: fetchRobinhood, start: "2026-09-07" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
