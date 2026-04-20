import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xf3393dC9E747225FcA0d61BfE588ba2838AFb077";

const TRADE_EVENT_ABI =
  "event Trade(address indexed trader, uint256 indexed playerId, bool isBuy, uint256 amountInUnits, uint256 priceInWei, uint256 feeInWei, uint256 newSupplyInUnits, bool isIPOWindow)";

const REFERRAL_FEE_PAID_ABI =
  "event ReferralFeePaid(address indexed referrer, address indexed user, uint256 amountInWei)";

const ETH_PRIZE_DEPOSITED_ABI =
  "event EthPrizeDeposited(uint256 amountInWei)";

// Trade.feeInWei carries the total user-paid fee on every fee-generating path
// (IPO buy + all sells). UserSharesChanged.totalFeesInWei is emitted 1:1 with
// each Trade and carries the same value, so summing Trade.feeInWei captures
// all fees without double-counting.
//
// Fee flow:
//   fees = prizePool + protocolTreasury + referrer(optional)
// Events used for the split:
//   EthPrizeDeposited   -> prize pool inflow (holders revenue)
//   ReferralFeePaid     -> actual referrer payouts (supply-side revenue)
//     (if referrer transfer fails the amount is redirected to protocol and
//      ReferralFeeRedirectedToProtocol is emitted instead — correctly
//      excluded from supplySideRevenue)
//   Protocol treasury   -> fees - prize - referral

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [tradeLogs, referralLogs, prizeLogs] = await Promise.all([
    options.getLogs({ target: CONTRACT, eventAbi: TRADE_EVENT_ABI }),
    options.getLogs({ target: CONTRACT, eventAbi: REFERRAL_FEE_PAID_ABI }),
    options.getLogs({ target: CONTRACT, eventAbi: ETH_PRIZE_DEPOSITED_ABI }),
  ]);

  let feeSum = 0n;
  let referralSum = 0n;
  let prizeSum = 0n;

  for (const log of tradeLogs) {
    // Buy:  priceInWei is gross (includes IPO fees when active)
    // Sell: priceInWei is net; gross = priceInWei + feeInWei
    const gross = log.isBuy
      ? BigInt(log.priceInWei)
      : BigInt(log.priceInWei) + BigInt(log.feeInWei);
    dailyVolume.addGasToken(gross);

    const fee = BigInt(log.feeInWei);
    dailyFees.addGasToken(fee);
    feeSum += fee;
  }

  for (const log of referralLogs) {
    const amt = BigInt(log.amountInWei);
    dailySupplySideRevenue.addGasToken(amt);
    referralSum += amt;
  }

  for (const log of prizeLogs) {
    const amt = BigInt(log.amountInWei);
    dailyHoldersRevenue.addGasToken(amt);
    prizeSum += amt;
  }

  // Invariant: the three fee components must not exceed gross fees. If this
  // ever trips, the split events are out of sync with Trade (e.g. a new fee
  // source was added on-chain) and we fail fast rather than publish an
  // inconsistent income statement.
  if (referralSum + prizeSum > feeSum) {
    throw new Error(
      `TopStrike fee splits exceed collected fees: fees=${feeSum} referral=${referralSum} prize=${prizeSum}`,
    );
  }

  const protocolShare = feeSum - referralSum - prizeSum;
  if (protocolShare > 0n) dailyProtocolRevenue.addGasToken(protocolShare);

  const revenueShare = feeSum - referralSum;
  if (revenueShare > 0n) dailyRevenue.addGasToken(revenueShare);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Gross ETH traded through buySharesByLots/buySharesByUnits and the corresponding sell functions, summed from Trade events.",
  Fees: "Total fees paid by traders, summed from Trade.feeInWei. Includes IPO buy fees (prize + protocol portions) and sell fees (prize + protocol + referral portions).",
  Revenue:
    "Fees retained by the protocol ecosystem (treasury + on-chain prize pool), i.e. dailyFees minus referral payouts.",
  ProtocolRevenue:
    "Protocol treasury share of fees, derived as dailyFees - prize pool inflows - referral payouts.",
  HoldersRevenue:
    "Prize pool inflows (EthPrizeDeposited) — redistributed on-chain to share holders via subsequent EthPrizeAwarded payouts.",
  SupplySideRevenue:
    "Referral fees paid to external referrers (ReferralFeePaid). Excludes cases where referrer transfer fails and the amount is redirected to the protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2026-01-11",
    },
  },
  methodology,
};

export default adapter;
