import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SOCIAL_PAYMENT_ACTION = "0xaEaB214c5E2F44B2dc22Fb426238292B128163C2";
const PREMIUM_CONTRACT = "0xca5bF1Bc5179936cAe9c60913496B54b77d1B17b";

const PAYMENT_PROCESSED_EVENT =
  "event PaymentProcessed(uint8 indexed actionType, address indexed payer, address indexed author, uint256 authorShare, uint256 treasuryShare, address feed, uint256 postId)";

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
  quotePostFeeToHeyTreasury: "Quote Post Fee To Hey Treasury",
  heyProBasicSubscription: "Hey Pro Basic Subscription",
  heyProProSubscription: "Hey Pro Pro Subscription",
  heyProEnterpriseSubscription: "Hey Pro Enterprise Subscription",
  heyProTierUpgrade: "Hey Pro Tier Upgrade",
  heyProGiftSubscription: "Hey Pro Gift Subscription",
} as const;

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

const SOCIAL_PAYMENT_TREASURY_LABELS: Record<number, string> = {
  [SocialPaymentActionType.POST]: LABELS.newPostFeeToHeyTreasury,
  [SocialPaymentActionType.COMMENT]: LABELS.commentFeeToHeyTreasury,
  [SocialPaymentActionType.QT]: LABELS.quotePostFeeToHeyTreasury,
};

const PREMIUM_SUBSCRIPTION_LABELS: Record<number, string> = {
  [PremiumTier.BASIC]: LABELS.heyProBasicSubscription,
  [PremiumTier.PRO]: LABELS.heyProProSubscription,
  [PremiumTier.ENTERPRISE]: LABELS.heyProEnterpriseSubscription,
};

const getPremiumSubscriptionLabel = (tier: number): string =>
  PREMIUM_SUBSCRIPTION_LABELS[tier] ?? LABELS.heyProBasicSubscription;

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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const paymentLogs = await options.getLogs({
    target: SOCIAL_PAYMENT_ACTION,
    eventAbi: PAYMENT_PROCESSED_EVENT,
  });

  for (const log of paymentLogs) {
    const authorShare = BigInt(log.authorShare);
    const treasuryShare = BigInt(log.treasuryShare);
    const gross = authorShare + treasuryShare;
    if (gross === 0n) continue;

    const actionType = Number(log.actionType);
    const feeLabel = SOCIAL_PAYMENT_FEE_LABELS[actionType];
    if (!feeLabel) continue;

    dailyFees.addGasToken(gross, feeLabel);

    if (authorShare > 0n) {
      const authorLabel = SOCIAL_PAYMENT_AUTHOR_LABELS[actionType];
      if (authorLabel) {
        dailySupplySideRevenue.addGasToken(authorShare, authorLabel);
      }
    }

    if (treasuryShare > 0n) {
      const treasuryLabel = SOCIAL_PAYMENT_TREASURY_LABELS[actionType];
      if (treasuryLabel) {
        dailyRevenue.addGasToken(treasuryShare, treasuryLabel);
        dailyProtocolRevenue.addGasToken(treasuryShare, treasuryLabel);
      }
    }
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
    "All native GHO Social Payment fees on Lens Chain (new posts, comments, reposts, quotes) plus Hey Pro yearly subscription payments.",
  UserFees:
    "GHO paid by users for Social Payment interactions and Hey Pro subscriptions on Hey.",
  SupplySideRevenue:
    "Author shares from Social Payment fees paid to content creators on comments, reposts, and quote posts.",
  Revenue:
    "Hey treasury shares from Social Payment fees plus full Hey Pro subscription revenue.",
  ProtocolRevenue:
    "All revenue retained by Hey treasury from Social Payment and Hey Pro subscriptions.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.newPostFee]:
      "GHO fee paid when publishing a new post through Hey Social Payment (0.03 GHO).",
    [LABELS.commentFee]:
      "GHO fee paid when commenting on a post through Hey Social Payment (0.02 GHO).",
    [LABELS.repostFee]:
      "GHO fee paid when reposting through Hey Social Payment (0.01 GHO).",
    [LABELS.quotePostFee]:
      "GHO fee paid when quoting a post through Hey Social Payment (0.03 GHO).",
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
  },
  SupplySideRevenue: {
    [LABELS.commentFeeToAuthors]:
      "Author share from comment fees paid to the source post author (0.01 GHO).",
    [LABELS.repostFeeToAuthors]:
      "Author share from repost fees paid to the original post author (0.01 GHO).",
    [LABELS.quotePostFeeToAuthors]:
      "Author share from quote fees paid to the quoted post author (0.01 GHO).",
  },
  Revenue: {
    [LABELS.newPostFeeToHeyTreasury]:
      "Hey treasury share from new post fees (0.03 GHO).",
    [LABELS.commentFeeToHeyTreasury]:
      "Hey treasury share from comment fees (0.01 GHO).",
    [LABELS.quotePostFeeToHeyTreasury]:
      "Hey treasury share from quote post fees (0.02 GHO).",
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
  },
  ProtocolRevenue: {
    [LABELS.newPostFeeToHeyTreasury]:
      "New post fee revenue allocated to Hey treasury.",
    [LABELS.commentFeeToHeyTreasury]:
      "Comment fee revenue allocated to Hey treasury.",
    [LABELS.quotePostFeeToHeyTreasury]:
      "Quote post fee revenue allocated to Hey treasury.",
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
