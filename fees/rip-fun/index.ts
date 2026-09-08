import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";

const USDC = coreAssets.base.USDC;

const CONTRACTS = {
  legacyPacketStore: "0xeBeA10BCd609d3F6fb2Ea104baB638396C037388",
  packetStore: "0x7E494D88Ac44C30539C14EC837D122464ee3B89f",
  comboStore: "0x9566f467ff1BF3DcEa1193A2deA34574bE987d74",
  sealedProductStore: "0x6E1cF2d280E1680b1DeB5601Feec8271f69f4C75",
  sealedProduct: "0x60E0e44715d421E88308aF8eff014e942DC2Fd0C",
  marketplace: "0x13C71B0061eC698E4bA46747e910EEdbf280dc21",
  auctionMarketplace: "0x7517A9fB0faB531490b9Ae8aeB925eEE8384Fb6A",
  buybackPool: "0x2c996D73326f704ff8401AfD6179871c608a57e5",
} as const;

const PROTOCOL_TREASURY = "0x7Bd6A0bfEEBe3BcF0Fec5FeBf85726D9fDc11B66";
// initializeSignedBuyback set e543 as recipient without CardRecipientUpdated;
// Initialized(3) was block 47_466_430/log123:
// https://basescan.org/tx/0x57805ccdfd97d418f68da6315f189e9fb38ca7f6c2113c4ee36ed3e2be08241b
const INITIAL_CARD_RECIPIENT =
  "0xe5431d1598Bb26A9D2bcE30B52056aAed91055A2";
const CARD_RECIPIENT_INITIALIZER = {
  blockNumber: 47_466_430,
  logIndex: 123,
} as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const COMBO_DEPLOY_BLOCK = 42_686_409;
const MARKETPLACE_DEPLOY_BLOCK = 41_215_711;
// Marketplace commissions use Math.mulDiv(..., 10_000, Math.Rounding.Ceil):
// https://basescan.org/address/0x4cb1f8ddbff8571bdef9b1908ddc7d918d59af60#code
const BPS_DENOMINATOR = 10_000n;

// The original implementation's setFees emitted no event. Historical fees()
// state changes from 100 to 250 at this block:
// https://basescan.org/block/41216019
const MARKETPLACE_FEE_CHANGE_BLOCK = 41_216_019;

const EVENTS = {
  packetSold:
    "event PacketSold(uint256 indexed packetId, address indexed buyer, uint256 price, uint256 packetTypeId)",
  instantPackSold:
    "event InstantPackSold(address indexed buyer, uint256 indexed packetTypeId, uint256 price)",
  instantPackPurchaseRequested:
    "event InstantPackPurchaseRequested(uint256 indexed requestId, address indexed payer, address indexed recipient, uint256 packetTypeId, uint256 price)",
  instantPackRefunded:
    "event InstantPackRefunded(uint256 indexed requestId, address indexed buyer, uint256 amount)",
  comboTierPurchased:
    "event ComboTierPurchased(address indexed purchaser, uint256 indexed tierId, uint256 requestId, uint256 price, uint256 timestamp)",
  voucherRedeemed:
    "event VoucherRedeemed(address indexed redeemer, uint256 indexed voucherTokenId, uint256 indexed tierId)",
  purchaseRefundedDueToInventory:
    "event PurchaseRefundedDueToInventory(uint256 indexed requestId, uint256 indexed tierId, address indexed purchaser)",
  requestCancelled:
    "event RequestCancelled(uint256 indexed requestId, uint256 indexed tierId, address indexed purchaser)",
  productSold:
    "event ProductSold(uint256 indexed productId, address indexed buyer, uint256 price, uint256 productTypeId)",
  openRequestFeePaid:
    "event OpenRequestFeePaid(uint256 indexed productId, address indexed payer, uint256 amount)",
  purchase:
    "event Purchase(address indexed buyer, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, address currency)",
  offerAccepted:
    "event OfferAccepted(address indexed buyer, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, address currency)",
  collectionOfferAccepted:
    "event CollectionOfferAccepted(address indexed buyer, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 pricePerItem, address currency, uint256 newFillCount, uint256 maxQuantity)",
  feesSet: "event FeesSet(uint256 oldFees, uint256 newFees)",
  auctionSettled:
    "event AuctionSettled(uint256 indexed auctionId, address indexed winner, address indexed seller, uint256 winningBid, uint256 feeAmount)",
  cardRecipientUpdated:
    "event CardRecipientUpdated(address indexed oldRecipient, address indexed newRecipient)",
  packetSellExecuted:
    "event PacketSellExecuted(address indexed seller, uint256[] packetIds, uint256 totalValue, uint256 timestamp)",
  cardSellExecuted:
    "event CardSellExecuted(address indexed seller, uint256[] cardIds, uint256 totalValue, uint256 timestamp)",
  gradedCardSellExecuted:
    "event GradedCardSellExecuted(address indexed seller, uint256[] cardIds, uint256 totalValue, uint256 timestamp)",
  sealedProductSellExecuted:
    "event SealedProductSellExecuted(address indexed seller, uint256[] productIds, uint256 totalValue, uint256 timestamp)",
  signedBuybackExecuted:
    "event SignedBuybackExecuted(bytes32 indexed buybackId, address indexed seller, uint256[] cardIds, uint256[] gradedCardIds, uint256 amount, string quoteId)",
} as const;

const LABELS = {
  packetSales: ["Packet Sales", "Packet Sales To Protocol"],
  instantPackSales: ["Instant Pack Sales", "Instant Pack Sales To Protocol"],
  comboTierSales: ["Combo Tier Sales", "Combo Tier Sales To Protocol"],
  sealedProductSales: [
    "Sealed Product Sales",
    "Sealed Product Sales To Protocol",
  ],
  sealedProductOpeningFees: [
    "Sealed Product Opening Fees",
    "Sealed Product Opening Fees To Protocol",
  ],
  purchaseRefunds: [
    "Purchase Refunds",
    "Purchase Refunds Paid By Protocol",
  ],
  marketplaceFees: ["Marketplace Fees", "Marketplace Fees To Protocol"],
  firstPartyMarketplaceSales: [
    "First-Party Marketplace Sales",
    "First-Party Marketplace Sales To Protocol",
  ],
  auctionFees: ["Auction Fees", "Auction Fees To Protocol"],
  firstPartyAuctionSales: [
    "First-Party Auction Sales",
    "First-Party Auction Sales To Protocol",
  ],
  inventoryBuybacks: [
    "Inventory Buybacks",
    "Inventory Buybacks Paid By Protocol",
  ],
} as const;

type Position = {
  blockNumber: number;
  logIndex: number;
};

type FeeUpdate = Position & {
  feeBps: bigint;
};

type RecipientUpdate = Position & {
  recipient: string;
};

type LabelPair = readonly [string, string];

const normalizeAddress = (address: string) => address.toLowerCase();

const ceilBps = (amount: bigint, bps: bigint) =>
  (amount * bps + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;

const toBigInt = (value: any): bigint => BigInt(value.toString());

const getArgs = (log: any) => log.args ?? log;

const requiredNumber = (value: any, field: string): number => {
  if (value === undefined || value === null)
    throw new Error("RIP.FUN log is missing " + field);
  return Number(value);
};

const getPosition = (log: any): Position => ({
  blockNumber: requiredNumber(
    log.blockNumber ?? log.block_number ?? log.block,
    "a block number",
  ),
  logIndex: requiredNumber(
    log.logIndex ?? log.log_index ?? log.index,
    "a log index",
  ),
});

const getTransactionHash = (log: any): string => {
  const hash =
    log.transactionHash ?? log.transaction_hash ?? log.txHash ?? log.tx_hash;
  if (!hash) throw new Error("RIP.FUN log is missing a transaction hash");
  return hash.toLowerCase();
};

const comparePositions = (a: Position, b: Position) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

const isStrictlyBefore = (a: Position, b: Position) =>
  comparePositions(a, b) < 0;

const getCashComboPurchases = (purchases: any[], vouchers: any[]) => {
  const voucherTransactions = new Set(vouchers.map(getTransactionHash));
  const cashPurchases = new Map<string, bigint>();

  purchases.forEach((log) => {
    if (voucherTransactions.has(getTransactionHash(log))) return;
    const args = getArgs(log);
    cashPurchases.set(args.requestId.toString(), toBigInt(args.price));
  });

  return cashPurchases;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const addFlow = (token: string, amount: bigint, pair: LabelPair) => {
    if (amount === 0n) return;
    dailyFees.add(token, amount, pair[0]);
    dailyRevenue.add(token, amount, pair[1]);
  };

  const packetSales = await options.getLogs({
    targets: [CONTRACTS.legacyPacketStore, CONTRACTS.packetStore],
    eventAbi: EVENTS.packetSold,
  });
  const instantPackSales = await options.getLogs({
    target: CONTRACTS.packetStore,
    eventAbi: EVENTS.instantPackSold,
  });
  const instantPackPurchaseRequests = await options.getLogs({
    target: CONTRACTS.packetStore,
    eventAbi: EVENTS.instantPackPurchaseRequested,
  });
  const instantPackRefunds = await options.getLogs({
    target: CONTRACTS.packetStore,
    eventAbi: EVENTS.instantPackRefunded,
  });
  const comboTierPurchases = await options.getLogs({
    target: CONTRACTS.comboStore,
    eventAbi: EVENTS.comboTierPurchased,
    onlyArgs: false,
  });
  const comboVouchers = await options.getLogs({
    target: CONTRACTS.comboStore,
    eventAbi: EVENTS.voucherRedeemed,
    onlyArgs: false,
  });
  const comboInventoryRefunds = await options.getLogs({
    target: CONTRACTS.comboStore,
    eventAbi: EVENTS.purchaseRefundedDueToInventory,
  });
  const comboCancellations = await options.getLogs({
    target: CONTRACTS.comboStore,
    eventAbi: EVENTS.requestCancelled,
  });
  const sealedProductSales = await options.getLogs({
    target: CONTRACTS.sealedProductStore,
    eventAbi: EVENTS.productSold,
  });
  const sealedProductOpeningFees = await options.getLogs({
    target: CONTRACTS.sealedProduct,
    eventAbi: EVENTS.openRequestFeePaid,
  });
  const marketplacePurchases = await options.getLogs({
    target: CONTRACTS.marketplace,
    eventAbi: EVENTS.purchase,
    onlyArgs: false,
  });
  const marketplaceOffers = await options.getLogs({
    target: CONTRACTS.marketplace,
    eventAbi: EVENTS.offerAccepted,
    onlyArgs: false,
  });
  const marketplaceCollectionOffers = await options.getLogs({
    target: CONTRACTS.marketplace,
    eventAbi: EVENTS.collectionOfferAccepted,
    onlyArgs: false,
  });
  const auctionSettlements = await options.getLogs({
    target: CONTRACTS.auctionMarketplace,
    eventAbi: EVENTS.auctionSettled,
    onlyArgs: false,
  });
  // Only completed execution events are accounting flows. Requests, quotes,
  // transfers, shipping, and protocol-owned recycling remain excluded.
  const packetBuybacks = await options.getLogs({
    target: CONTRACTS.buybackPool,
    eventAbi: EVENTS.packetSellExecuted,
    onlyArgs: false,
  });
  const cardBuybacks = await options.getLogs({
    target: CONTRACTS.buybackPool,
    eventAbi: EVENTS.cardSellExecuted,
    onlyArgs: false,
  });
  const gradedCardBuybacks = await options.getLogs({
    target: CONTRACTS.buybackPool,
    eventAbi: EVENTS.gradedCardSellExecuted,
    onlyArgs: false,
  });
  const sealedProductBuybacks = await options.getLogs({
    target: CONTRACTS.buybackPool,
    eventAbi: EVENTS.sealedProductSellExecuted,
    onlyArgs: false,
  });
  const signedBuybacks = await options.getLogs({
    target: CONTRACTS.buybackPool,
    eventAbi: EVENTS.signedBuybackExecuted,
    onlyArgs: false,
  });

  const marketplaceActivity = [
    ...marketplacePurchases,
    ...marketplaceOffers,
    ...marketplaceCollectionOffers,
  ];
  const buybackActivity = [
    ...packetBuybacks,
    ...cardBuybacks,
    ...gradedCardBuybacks,
    ...sealedProductBuybacks,
    ...signedBuybacks,
  ];
  const needsRecipientHistory = [
    ...marketplaceActivity,
    ...auctionSettlements,
    ...buybackActivity,
  ].some(
    (log) =>
      comparePositions(getPosition(log), CARD_RECIPIENT_INITIALIZER) >= 0,
  );

  const marketplaceFeeUpdateLogs = marketplaceActivity.length
    ? await options.getLogs({
        target: CONTRACTS.marketplace,
        eventAbi: EVENTS.feesSet,
        fromBlock: MARKETPLACE_DEPLOY_BLOCK,
        cacheInCloud: true,
        onlyArgs: false,
      })
    : [];
  const recipientUpdateLogs = needsRecipientHistory
    ? await options.getLogs({
        target: CONTRACTS.buybackPool,
        eventAbi: EVENTS.cardRecipientUpdated,
        fromBlock: CARD_RECIPIENT_INITIALIZER.blockNumber,
        cacheInCloud: true,
        onlyArgs: false,
      })
    : [];

  const feeUpdates: FeeUpdate[] = marketplaceFeeUpdateLogs
    .map((log) => ({
      ...getPosition(log),
      feeBps: toBigInt(getArgs(log).newFees),
    }))
    .sort(comparePositions);

  const recipientUpdates: RecipientUpdate[] = recipientUpdateLogs
    .map((log) => ({
      ...getPosition(log),
      recipient: normalizeAddress(getArgs(log).newRecipient),
    }))
    .filter(
      (update) => comparePositions(update, CARD_RECIPIENT_INITIALIZER) > 0,
    )
    .sort(comparePositions);

  const isProtocolSellerAt = (seller: string, log: any) => {
    const normalizedSeller = normalizeAddress(seller);
    if (normalizedSeller === normalizeAddress(PROTOCOL_TREASURY)) return true;

    const position = getPosition(log);
    let activeRecipient =
      comparePositions(position, CARD_RECIPIENT_INITIALIZER) >= 0
        ? normalizeAddress(INITIAL_CARD_RECIPIENT)
        : ZERO_ADDRESS;

    for (const update of recipientUpdates) {
      if (!isStrictlyBefore(update, position)) break;
      activeRecipient = update.recipient;
    }

    return (
      activeRecipient !== ZERO_ADDRESS &&
      normalizedSeller === activeRecipient
    );
  };

  packetSales.forEach(({ price }: any) =>
    addFlow(USDC, toBigInt(price), LABELS.packetSales),
  );
  instantPackSales.forEach(({ price }: any) =>
    addFlow(USDC, toBigInt(price), LABELS.instantPackSales),
  );
  instantPackPurchaseRequests.forEach(({ price }: any) =>
    addFlow(USDC, toBigInt(price), LABELS.instantPackSales),
  );
  instantPackRefunds.forEach(({ amount }: any) =>
    addFlow(USDC, -toBigInt(amount), LABELS.purchaseRefunds),
  );

  const currentCashComboPurchases = getCashComboPurchases(
    comboTierPurchases,
    comboVouchers,
  );
  currentCashComboPurchases.forEach((price) =>
    addFlow(USDC, price, LABELS.comboTierSales),
  );

  const reversedRequestIds = new Set(
    [...comboInventoryRefunds, ...comboCancellations].map((log) =>
      getArgs(log).requestId.toString(),
    ),
  );

  if (reversedRequestIds.size) {
    const historicalPurchases = await options.getLogs({
      target: CONTRACTS.comboStore,
      eventAbi: EVENTS.comboTierPurchased,
      fromBlock: COMBO_DEPLOY_BLOCK,
      cacheInCloud: true,
      onlyArgs: false,
    });
    const historicalVouchers = await options.getLogs({
      target: CONTRACTS.comboStore,
      eventAbi: EVENTS.voucherRedeemed,
      fromBlock: COMBO_DEPLOY_BLOCK,
      cacheInCloud: true,
      onlyArgs: false,
    });
    const historicalCashPurchases = getCashComboPurchases(
      historicalPurchases,
      historicalVouchers,
    );

    reversedRequestIds.forEach((requestId) => {
      const price = historicalCashPurchases.get(requestId);
      if (price !== undefined)
        addFlow(USDC, -price, LABELS.purchaseRefunds);
    });
  }

  sealedProductSales.forEach(({ price }: any) =>
    addFlow(USDC, toBigInt(price), LABELS.sealedProductSales),
  );
  sealedProductOpeningFees.forEach(({ amount }: any) =>
    addFlow(USDC, toBigInt(amount), LABELS.sealedProductOpeningFees),
  );

  const marketplaceFeeBpsAt = (position: Position) => {
    let feeBps =
      position.blockNumber < MARKETPLACE_FEE_CHANGE_BLOCK ? 100n : 250n;

    for (const update of feeUpdates) {
      if (!isStrictlyBefore(update, position)) break;
      feeBps = update.feeBps;
    }

    return feeBps;
  };

  const accountMarketplaceSales = (
    logs: any[],
    amountField: "price" | "pricePerItem",
  ) => {
    // Sale events do not expose creator-code waiver status, so this uses the
    // standard on-chain fee schedule.
    logs.forEach((log) => {
      const args = getArgs(log);
      const gross = toBigInt(args[amountField]);
      const isFirstParty = isProtocolSellerAt(args.seller, log);
      const amount = isFirstParty
        ? gross
        : ceilBps(gross, marketplaceFeeBpsAt(getPosition(log)));
      const pair = isFirstParty
        ? LABELS.firstPartyMarketplaceSales
        : LABELS.marketplaceFees;
      addFlow(args.currency, amount, pair);
    });
  };

  accountMarketplaceSales(marketplacePurchases, "price");
  accountMarketplaceSales(marketplaceOffers, "price");
  accountMarketplaceSales(marketplaceCollectionOffers, "pricePerItem");

  auctionSettlements.forEach((log) => {
    const args = getArgs(log);
    const isFirstParty = isProtocolSellerAt(args.seller, log);
    const amount = isFirstParty
      ? toBigInt(args.winningBid)
      : toBigInt(args.feeAmount);
    const pair = isFirstParty
      ? LABELS.firstPartyAuctionSales
      : LABELS.auctionFees;
    addFlow(USDC, amount, pair);
  });

  const accountBuybacks = (
    logs: any[],
    amountField: "totalValue" | "amount",
  ) => {
    logs.forEach((log) => {
      const args = getArgs(log);
      if (isProtocolSellerAt(args.seller, log)) return;
      addFlow(
        USDC,
        -toBigInt(args[amountField]),
        LABELS.inventoryBuybacks,
      );
    });
  };

  accountBuybacks(packetBuybacks, "totalValue");
  accountBuybacks(cardBuybacks, "totalValue");
  accountBuybacks(gradedCardBuybacks, "totalValue");
  accountBuybacks(sealedProductBuybacks, "totalValue");
  accountBuybacks(signedBuybacks, "amount");

  return { dailyFees, dailyRevenue };
};

const methodology = {
  Fees: "Cash primary sales and opening fees, marketplace commissions, and first-party marketplace and auction proceeds, net of purchase refunds and completed external inventory buybacks. Voucher-funded purchases and protocol-owned inventory recycling are excluded.",
  Revenue: "All fees (cash primary sales, opening fees, marketplace commissions, and first-party marketplace and auction proceeds, net of purchase refunds and completed external inventory buybacks) accrue to RIP.FUN.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.packetSales[0]]: "Cash collected from packet sales.",
    [LABELS.instantPackSales[0]]: "Cash collected from instant-pack sales.",
    [LABELS.comboTierSales[0]]:
      "Cash combo-tier sales, excluding voucher-funded purchases.",
    [LABELS.sealedProductSales[0]]:
      "Cash collected from sealed-product sales.",
    [LABELS.sealedProductOpeningFees[0]]:
      "Fees paid to open sealed products.",
    [LABELS.purchaseRefunds[0]]:
      "Cash returned after refunds, inventory shortfalls, or cancellations.",
    [LABELS.marketplaceFees[0]]:
      "Standard-rate commissions on external marketplace sales.",
    [LABELS.firstPartyMarketplaceSales[0]]:
      "Gross proceeds from first-party marketplace sales.",
    [LABELS.auctionFees[0]]: "Fees on external auction settlements.",
    [LABELS.firstPartyAuctionSales[0]]:
      "Gross proceeds from first-party auction settlements.",
    [LABELS.inventoryBuybacks[0]]:
      "Completed inventory purchases from external sellers.",
  },
  Revenue: {
    [LABELS.packetSales[1]]: "Packet-sale proceeds accruing to RIP.FUN.",
    [LABELS.instantPackSales[1]]:
      "Instant-pack sale proceeds accruing to RIP.FUN.",
    [LABELS.comboTierSales[1]]:
      "Cash combo-tier proceeds accruing to RIP.FUN.",
    [LABELS.sealedProductSales[1]]:
      "Sealed-product sale proceeds accruing to RIP.FUN.",
    [LABELS.sealedProductOpeningFees[1]]:
      "Sealed-product opening fees accruing to RIP.FUN.",
    [LABELS.purchaseRefunds[1]]: "Cash purchase refunds paid by RIP.FUN.",
    [LABELS.marketplaceFees[1]]:
      "External marketplace commissions accruing to RIP.FUN.",
    [LABELS.firstPartyMarketplaceSales[1]]:
      "Gross first-party marketplace proceeds accruing to RIP.FUN.",
    [LABELS.auctionFees[1]]: "External auction fees accruing to RIP.FUN.",
    [LABELS.firstPartyAuctionSales[1]]:
      "Gross first-party auction proceeds accruing to RIP.FUN.",
    [LABELS.inventoryBuybacks[1]]:
      "Completed external inventory buybacks paid by RIP.FUN.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-06-04",
  methodology,
  breakdownMethodology,
  // Completed external inventory buybacks can exceed inflows in an hourly window.
  allowNegativeValue: true,
};

export default adapter;
