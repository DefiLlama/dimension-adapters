import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GACHA_PACKS = "0xA26De0Ed1c24f54Cf316C9CDb8fEFF1ea68E5AB4";
const MARKETPLACE_ESCROW = "0x90A40f2befe2CE0AA10e951dbc47e2B6837Cfd9d";
const BUYBACK = "0x8D8669ADE9D390A6dD03D384983A5bb334369dAa";
const PACK_BATTLE = "0x7cC8173A9eD2dF8BAb306bbF28eDa301032D3936";

const PAYMENT_TYPE_PAID = 0;
const USDC_DECIMALS = 1e6; // YourGrails accounting events are denominated in 6-decimal USDC.
const BATTLE_PLAYER_COUNT = 2n; // platformFee is per player; BattleJoined means both players paid.

const abis = {
  packPurchased:
    "event PackPurchased(uint256 indexed purchaseId, address indexed buyer, uint256 packId, uint256 commitBlock, uint256 packNftTokenId)",
  purchasePaymentType: "function purchasePaymentType(uint256 purchaseId) view returns (uint8)",
  packs: "function packs(uint256 packId) view returns (uint256 price, bool active, uint256 cardsPerPack)",
  sale: "event Sale(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)",
  buybackExecuted: "event BuybackExecuted(uint256 indexed tokenId, address indexed seller, uint256 price)",
  battleJoined: "event BattleJoined(uint256 indexed battleId, address indexed player2)",
  getBattle:
    "function getBattle(uint256 battleId) view returns (address player1, address player2, uint256 packId, uint256 packPrice, uint256 entryFee, uint256 platformFee, uint8 status, uint256 revealDeadline, bool player1Revealed, bool player2Revealed, address winner, uint256 player1Value, uint256 player2Value, uint256 createdAt, uint256 expiresAt)",
};

const toBigInt = (value: any) => BigInt(value?.toString?.() ?? value ?? 0);
const key = (value: any) => value?.toString?.() ?? String(value);
const toUsd = (value: bigint) => Number(value) / USDC_DECIMALS;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const packPurchaseLogs = await options.getLogs({
    target: GACHA_PACKS,
    eventAbi: abis.packPurchased,
  });

  if (packPurchaseLogs.length > 0) {
    const paymentTypes = await options.api.multiCall({
      target: GACHA_PACKS,
      abi: abis.purchasePaymentType,
      calls: packPurchaseLogs.map(({ purchaseId }: any) => purchaseId),
      permitFailure: true,
    });

    const paidPackIds = packPurchaseLogs
      .filter((_: any, index: number) => Number(paymentTypes[index]) === PAYMENT_TYPE_PAID)
      .map(({ packId }: any) => packId);
    const uniquePackIds = [...new Map(paidPackIds.map((packId: any) => [key(packId), packId])).values()];

    const packConfigs = uniquePackIds.length > 0
      ? await options.api.multiCall({
        target: GACHA_PACKS,
        abi: abis.packs,
        calls: uniquePackIds,
        permitFailure: true,
      })
      : [];
    const priceByPackId = new Map<string, bigint>();
    uniquePackIds.forEach((packId: any, index: number) => {
      const pack = packConfigs[index];
      if (!pack) return;
      priceByPackId.set(key(packId), toBigInt(pack.price ?? pack[0]));
    });

    for (const packId of paidPackIds) {
      const price = priceByPackId.get(key(packId));
      if (!price || price === 0n) continue;
      const packPriceUsd = toUsd(price);
      dailyVolume.addUSDValue(packPriceUsd, "Gacha Pack Sales");
      dailyFees.addUSDValue(packPriceUsd, "Gacha Pack Sales");
    }
  }

  const marketplaceSales = await options.getLogs({
    target: MARKETPLACE_ESCROW,
    eventAbi: abis.sale,
  });
  for (const { price, fee } of marketplaceSales as any[]) {
    const salePriceUsd = toUsd(toBigInt(price));
    const feeUsd = toUsd(toBigInt(fee));
    if (salePriceUsd > 0) dailyVolume.addUSDValue(salePriceUsd, "Marketplace Sales");
    if (feeUsd > 0) {
      dailyFees.addUSDValue(feeUsd, "Marketplace Fees");
    }
  }

  const battleJoinedLogs = await options.getLogs({
    target: PACK_BATTLE,
    eventAbi: abis.battleJoined,
  });
  if (battleJoinedLogs.length > 0) {
    const battles = await options.api.multiCall({
      target: PACK_BATTLE,
      abi: abis.getBattle,
      calls: battleJoinedLogs.map(({ battleId }: any) => battleId),
      permitFailure: true,
    });
    for (const battle of battles) {
      if (!battle) continue;
      const platformFee = toBigInt(battle.platformFee ?? battle[5]);
      const battleFeesUsd = toUsd(platformFee * BATTLE_PLAYER_COUNT);
      if (battleFeesUsd <= 0) continue;
      dailyFees.addUSDValue(battleFeesUsd, "Battle Platform Fees");
    }
  }

  const buybackLogs = await options.getLogs({
    target: BUYBACK,
    eventAbi: abis.buybackExecuted,
  });
  for (const { price } of buybackLogs as any[]) {
    const payoutUsd = toUsd(toBigInt(price));
    if (payoutUsd <= 0) continue;
    dailyFees.addUSDValue(-payoutUsd, "Pack Buyback Payouts");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Gross pack purchase volume and marketplace sale volume.",
  Fees:
    "Net fees from paid gacha pack sales, battle platform fees, and marketplace fees, minus instant pack buyback payouts.",
  UserFees:
    "Net fees from paid gacha pack sales, battle platform fees, and marketplace fees, minus instant pack buyback payouts.",
  Revenue:
    "Protocol revenue from paid gacha pack sales, battle platform fees, and marketplace fees, net of instant pack buyback payouts.",
  ProtocolRevenue:
    "Protocol revenue from paid gacha pack sales, battle platform fees, and marketplace fees, net of instant pack buyback payouts.",
  SupplySideRevenue:
    "No supply-side revenue is reported by this adapter.",
};

const commonBreakdown = {
  "Gacha Pack Sales": "Paid pack purchases emitted by the GachaPacks contract. Coupon redemptions are excluded.",
  "Battle Platform Fees": "Per-player battle platform fee, counted when the second player joins and the battle buys packs.",
  "Marketplace Fees": "Platform fee from marketplace sales and accepted bids.",
  "Pack Buyback Payouts": "Instant buyback payouts paid to users, subtracted from fees and revenue.",
};

const breakdownMethodology = {
  Fees: commonBreakdown,
  Revenue: commonBreakdown,
  UserFees: commonBreakdown,
  ProtocolRevenue: commonBreakdown,
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.AVAX],
  start: "2026-06-08",
  fetch,
  methodology,
  breakdownMethodology,
  // Buyback payouts can exceed gross sales in a window, so net fees/revenue may be negative.
  allowNegativeValue: true,
};

export default adapter;
