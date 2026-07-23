import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const HEY_TREASURY = "0x2032360d868912867d7d0c3cee9c08f0a3d2ead9";
const SOCIAL_PAYMENT_ACTION = "0xaEaB214c5E2F44B2dc22Fb426238292B128163C2";
const SOCIAL_PAYMENT_POST_RULE = "0x9060719480D5A431Dd3CE865a1Da97822288906e";
const PREMIUM_CONTRACT = "0xca5bF1Bc5179936cAe9c60913496B54b77d1B17b";

// zkSync-style L2 base token — native GHO transfers emit ERC-20 Transfer logs here
const L2_BASE_TOKEN = "0x000000000000000000000000000000000000800a";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

const PAYMENT_PROCESSED_EVENT =
  "event PaymentProcessed(uint8 indexed actionType, address indexed payer, address indexed author, uint256 authorShare, uint256 treasuryShare, address feed, uint256 postId)";

const INTERACTION_PREPAID_EVENT =
  "event InteractionPrepaid(address indexed feed, bytes32 indexed configSalt, uint256 indexed rootPostId, address payer, uint8 actionType, address payoutAuthor, uint256 authorShare, uint256 treasuryShare, uint256 prepaidUntil)";

const SUBSCRIBED_EVENT =
  "event Subscribed(address indexed subscriber, uint8 indexed tier, uint256 expiresAt, uint256 pricePaid)";

const TIER_UPGRADED_EVENT =
  "event TierUpgraded(address indexed subscriber, uint8 indexed oldTier, uint8 indexed newTier, uint256 expiresAt, uint256 upgradeCost)";

const GIFT_SENT_EVENT =
  "event GiftSent(address indexed from, address indexed to, uint8 indexed tier, uint256 expiresAt, uint256 pricePaid)";

const SocialPaymentActionType = {
  POST: 0,
  COMMENT: 1,
  REPOST: 2,
  QT: 3,
} as const;

const PremiumTier = {
  BASIC: 1,
  PRO: 2,
  ENTERPRISE: 3,
} as const;

const LABELS = {
  newPostFee: "New Post Fee",
  commentFee: "Comment Fee",
  repostFee: "Repost Fee",
  quotePostFee: "Quote Post Fee",
  commentFeeToAuthors: "Comment Fee To Authors",
  repostFeeToAuthors: "Repost Fee To Authors",
  quotePostFeeToAuthors: "Quote Post Fee To Authors",
  newPostFeeToHeyTreasury: "New Post Fee To Hey Treasury",
  commentFeeToHeyTreasury: "Comment Fee To Hey Treasury",
  repostFeeToHeyTreasury: "Repost Fee To Hey Treasury",
  quotePostFeeToHeyTreasury: "Quote Post Fee To Hey Treasury",
  heyProBasicSubscription: "Hey Pro Basic Subscription",
  heyProProSubscription: "Hey Pro Pro Subscription",
  heyProEnterpriseSubscription: "Hey Pro Enterprise Subscription",
  heyProTierUpgrade: "Hey Pro Tier Upgrade",
  heyProGiftSubscription: "Hey Pro Gift Subscription",
  heyProUnknownTierSubscription: "Hey Pro Unknown Tier Subscription",
} as const;

// hey-takip: treasury wallet amount → action type (PaymentProcessed'dan bağımsız)
const GHO_0_01 = 10n ** 16n; // 0.01 GHO
const GHO_0_02 = 2n * 10n ** 16n; // 0.02 GHO
const GHO_0_03 = 3n * 10n ** 16n; // 0.03 GHO

const TREASURY_ACTION_BY_WEI: Record<
  string,
  { feeLabel: string; treasuryLabel: string }
> = {
  [GHO_0_01.toString()]: {
    feeLabel: LABELS.commentFee,
    treasuryLabel: LABELS.commentFeeToHeyTreasury,
  },
  [GHO_0_02.toString()]: {
    feeLabel: LABELS.quotePostFee,
    treasuryLabel: LABELS.quotePostFeeToHeyTreasury,
  },
  [GHO_0_03.toString()]: {
    feeLabel: LABELS.newPostFee,
    treasuryLabel: LABELS.newPostFeeToHeyTreasury,
  },
};

const SOCIAL_PAYMENT_FEE_LABELS: Record<number, string> = {
  [SocialPaymentActionType.POST]: LABELS.newPostFee,
  [SocialPaymentActionType.COMMENT]: LABELS.commentFee,
  [SocialPaymentActionType.REPOST]: LABELS.repostFee,
  [SocialPaymentActionType.QT]: LABELS.quotePostFee,
};

const SOCIAL_PAYMENT_AUTHOR_LABELS: Record<number, string> = {
  [SocialPaymentActionType.COMMENT]: LABELS.commentFeeToAuthors,
  [SocialPaymentActionType.REPOST]: LABELS.repostFeeToAuthors,
  [SocialPaymentActionType.QT]: LABELS.quotePostFeeToAuthors,
};

const PREMIUM_SUBSCRIPTION_LABELS: Record<number, string> = {
  [PremiumTier.BASIC]: LABELS.heyProBasicSubscription,
  [PremiumTier.PRO]: LABELS.heyProProSubscription,
  [PremiumTier.ENTERPRISE]: LABELS.heyProEnterpriseSubscription,
};

const padAddress = (address: string) =>
  "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");

const getPremiumSubscriptionLabel = (tier: number): string =>
  PREMIUM_SUBSCRIPTION_LABELS[tier] ?? LABELS.heyProUnknownTierSubscription;

const addPremiumRevenue = (
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
    dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
  amount: bigint,
  label: string
) => {
  if (amount <= 0n) return;
  balances.dailyFees.addGasToken(amount, label);
  balances.dailyRevenue.addGasToken(amount, label);
  balances.dailyProtocolRevenue.addGasToken(amount, label);
};

const addAuthorShare = (
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
  actionType: number,
  authorShare: bigint
) => {
  if (authorShare <= 0n) return;
  const feeLabel = SOCIAL_PAYMENT_FEE_LABELS[actionType];
  const authorLabel = SOCIAL_PAYMENT_AUTHOR_LABELS[actionType];
  if (!feeLabel || !authorLabel) return;
  balances.dailyFees.addGasToken(authorShare, feeLabel);
  balances.dailySupplySideRevenue.addGasToken(authorShare, authorLabel);
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const authorBalances = { dailyFees, dailySupplySideRevenue };

  const [paymentLogs, postRuleLogs, treasuryLogs] = await Promise.all([
    options.getLogs({
      target: SOCIAL_PAYMENT_ACTION,
      eventAbi: PAYMENT_PROCESSED_EVENT,
    }),
    options.getLogs({
      target: SOCIAL_PAYMENT_POST_RULE,
      eventAbi: INTERACTION_PREPAID_EVENT,
    }),
    options.getLogs({
      target: L2_BASE_TOKEN,
      eventAbi: TRANSFER_EVENT,
      topics: [TRANSFER_TOPIC, null as any, padAddress(HEY_TREASURY)],
    }),
  ]);

  // Author shares: Action Hub + Post Rule (hey-takip / hey.xyz uyumlu)
  for (const log of paymentLogs) {
    addAuthorShare(
      authorBalances,
      Number(log.actionType),
      BigInt(log.authorShare)
    );
  }

  for (const log of postRuleLogs) {
    addAuthorShare(
      authorBalances,
      Number(log.actionType),
      BigInt(log.authorShare)
    );
  }

  // Social payment treasury: native GHO inflows to Hey treasury wallet
  // Exact 0.01 / 0.02 / 0.03 only — premium stays on subscription events
  for (const log of treasuryLogs) {
    const value = BigInt(log.value);
    const mapped = TREASURY_ACTION_BY_WEI[value.toString()];
    if (!mapped) continue;
    dailyFees.addGasToken(value, mapped.feeLabel);
    dailyRevenue.addGasToken(value, mapped.treasuryLabel);
    dailyProtocolRevenue.addGasToken(value, mapped.treasuryLabel);
  }

  const premiumBalances = { dailyFees, dailyProtocolRevenue, dailyRevenue };

  const subscribedLogs = await options.getLogs({
    target: PREMIUM_CONTRACT,
    eventAbi: SUBSCRIBED_EVENT,
  });
  for (const log of subscribedLogs) {
    addPremiumRevenue(
      premiumBalances,
      BigInt(log.pricePaid),
      getPremiumSubscriptionLabel(Number(log.tier))
    );
  }

  const upgradedLogs = await options.getLogs({
    target: PREMIUM_CONTRACT,
    eventAbi: TIER_UPGRADED_EVENT,
  });
  for (const log of upgradedLogs) {
    addPremiumRevenue(
      premiumBalances,
      BigInt(log.upgradeCost),
      LABELS.heyProTierUpgrade
    );
  }

  const giftLogs = await options.getLogs({
    target: PREMIUM_CONTRACT,
    eventAbi: GIFT_SENT_EVENT,
  });
  for (const log of giftLogs) {
    addPremiumRevenue(
      premiumBalances,
      BigInt(log.pricePaid),
      LABELS.heyProGiftSubscription
    );
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Fees:
    "Social Payment gross fees on Lens Chain (Hey treasury wallet inflows of 0.01/0.02/0.03 GHO plus author shares from Action Hub and Post Rule) plus Hey Pro yearly subscription payments.",
  UserFees:
    "GHO paid by users for Social Payment interactions and Hey Pro subscriptions on Hey.",
  SupplySideRevenue:
    "Author shares from Social Payment fees (Action Hub PaymentProcessed + Post Rule InteractionPrepaid) paid to content creators on comments, reposts, and quote posts.",
  Revenue:
    "Native GHO Social Payment inflows to the Hey treasury wallet (0.01/0.02/0.03 GHO action shares) plus full Hey Pro subscription revenue from subscription events.",
  ProtocolRevenue:
    "All revenue retained by Hey treasury from Social Payment wallet inflows and Hey Pro subscriptions.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.newPostFee]:
      "GHO fee paid when publishing a new post through Hey Social Payment (0.03 GHO), measured as treasury wallet inflow.",
    [LABELS.commentFee]:
      "GHO fee paid when commenting (0.02 GHO): 0.01 treasury wallet inflow + 0.01 author share from Action Hub or Post Rule.",
    [LABELS.repostFee]:
      "GHO fee paid when reposting (0.01 GHO), measured as author share from Action Hub or Post Rule (treasury share is 0).",
    [LABELS.quotePostFee]:
      "GHO fee paid when quoting a post (0.03 GHO): 0.02 treasury wallet inflow + 0.01 author share from Action Hub or Post Rule.",
    [LABELS.heyProBasicSubscription]:
      "Yearly Hey Pro Basic subscription paid in native GHO (default 1.99 GHO).",
    [LABELS.heyProProSubscription]:
      "Yearly Hey Pro subscription paid in native GHO (default 4.99 GHO).",
    [LABELS.heyProEnterpriseSubscription]:
      "Yearly Hey Pro Enterprise subscription paid in native GHO (default 14.99 GHO).",
    [LABELS.heyProTierUpgrade]:
      "GHO paid when upgrading an active Hey Pro subscription to a higher tier.",
    [LABELS.heyProGiftSubscription]:
      "GHO paid when gifting a Hey Pro subscription to another user.",
    [LABELS.heyProUnknownTierSubscription]:
      "Hey Pro subscription paid in native GHO for an unrecognized tier value.",
  },
  SupplySideRevenue: {
    [LABELS.commentFeeToAuthors]:
      "Author share from comment fees paid to the source post author (0.01 GHO) via Action Hub or Post Rule.",
    [LABELS.repostFeeToAuthors]:
      "Author share from repost fees paid to the original post author (0.01 GHO) via Action Hub or Post Rule.",
    [LABELS.quotePostFeeToAuthors]:
      "Author share from quote fees paid to the quoted post author (0.01 GHO) via Action Hub or Post Rule.",
  },
  Revenue: {
    [LABELS.newPostFeeToHeyTreasury]:
      "Native GHO (0.03) received by Hey treasury wallet from new post fees.",
    [LABELS.commentFeeToHeyTreasury]:
      "Native GHO (0.01) received by Hey treasury wallet from comment fees.",
    [LABELS.quotePostFeeToHeyTreasury]:
      "Native GHO (0.02) received by Hey treasury wallet from quote post fees.",
    [LABELS.repostFeeToHeyTreasury]:
      "Hey treasury share from repost fees (0 GHO under current fee schedule).",
    [LABELS.heyProBasicSubscription]:
      "Full Hey Pro Basic subscription revenue retained by Hey.",
    [LABELS.heyProProSubscription]:
      "Full Hey Pro subscription revenue retained by Hey.",
    [LABELS.heyProEnterpriseSubscription]:
      "Full Hey Pro Enterprise subscription revenue retained by Hey.",
    [LABELS.heyProTierUpgrade]:
      "Hey Pro tier upgrade revenue retained by Hey.",
    [LABELS.heyProGiftSubscription]:
      "Hey Pro gift subscription revenue retained by Hey.",
    [LABELS.heyProUnknownTierSubscription]:
      "Hey Pro subscription revenue retained by Hey for an unrecognized tier value.",
  },
  ProtocolRevenue: {
    [LABELS.newPostFeeToHeyTreasury]:
      "New post fee revenue received by Hey treasury wallet.",
    [LABELS.commentFeeToHeyTreasury]:
      "Comment fee revenue received by Hey treasury wallet.",
    [LABELS.quotePostFeeToHeyTreasury]:
      "Quote post fee revenue received by Hey treasury wallet.",
    [LABELS.repostFeeToHeyTreasury]:
      "Repost fee revenue allocated to Hey treasury (0 GHO under current fee schedule).",
    [LABELS.heyProBasicSubscription]:
      "Hey Pro Basic subscription revenue allocated to Hey treasury.",
    [LABELS.heyProProSubscription]:
      "Hey Pro subscription revenue allocated to Hey treasury.",
    [LABELS.heyProEnterpriseSubscription]:
      "Hey Pro Enterprise subscription revenue allocated to Hey treasury.",
    [LABELS.heyProTierUpgrade]:
      "Hey Pro tier upgrade revenue allocated to Hey treasury.",
    [LABELS.heyProGiftSubscription]:
      "Hey Pro gift subscription revenue allocated to Hey treasury.",
    [LABELS.heyProUnknownTierSubscription]:
      "Hey Pro subscription revenue allocated to Hey treasury for an unrecognized tier value.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.LENS],
  start: "2026-05-15",
  methodology,
  breakdownMethodology,
};

export default adapter;
