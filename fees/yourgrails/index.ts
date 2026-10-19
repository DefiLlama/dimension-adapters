import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GACHA_PACKS = "0xA26De0Ed1c24f54Cf316C9CDb8fEFF1ea68E5AB4";
const MARKETPLACE_ESCROW = "0x90A40f2befe2CE0AA10e951dbc47e2B6837Cfd9d";
const BUYBACK = "0x8D8669ADE9D390A6dD03D384983A5bb334369dAa";
const PACK_BATTLE = "0x7cC8173A9eD2dF8BAb306bbF28eDa301032D3936";
const REGATTA = "0xcb023fbE6c922a9063d9e4dDb419Fb938A0a9D0c"; // Regatta pack races, deployed 2026-10-07

// Protocol-owned wallets. The treasury is the house opponent in pack battles and the House
// wallet is the house racer in Regatta. Their entries, pack buys and sell-backs move protocol
// funds between protocol wallets, so they are excluded from volume, fees and buyback payouts.
const PROTOCOL_WALLETS = new Set([
  "0xfe85c993605dd02ffd2b0b7db041f51071e45cd1", // treasury
  "0xaa9a3189e538555375e34a3db0469ffc33aaf53d", // Regatta House
]);

// Packs bought by the battle contracts are paid for by the entries, which are counted per player.
const BATTLE_CONTRACTS = new Set([PACK_BATTLE.toLowerCase(), REGATTA.toLowerCase()]);

// GachaPacks pack ids by game: 0 and 1 are Pokemon (since launch), 2 is One Piece (since 2026-10-07).
const PACK_SALES_LABELS: Record<string, string> = {
  "0": "Pokemon Pack Sales",
  "1": "Pokemon Pack Sales",
  "2": "One Piece Pack Sales",
};
const UNMAPPED_PACK_SALES_LABEL = "Gacha Pack Sales";

const PAYMENT_TYPE_PAID = 0;
const USDC_DECIMALS = 1e6; // YourGrails accounting events are denominated in 6-decimal USDC.

const abis = {
  packPurchased:
    "event PackPurchased(uint256 indexed purchaseId, address indexed buyer, uint256 packId, uint256 commitBlock, uint256 packNftTokenId)",
  purchasePaymentType: "function purchasePaymentType(uint256 purchaseId) view returns (uint8)",
  packs: "function packs(uint256 packId) view returns (uint256 price, bool active, uint256 cardsPerPack)",
  sale: "event Sale(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 fee)",
  buybackExecuted: "event BuybackExecuted(uint256 indexed tokenId, address indexed seller, uint256 price)",
  battleJoined: "event BattleJoined(uint256 indexed battleId, address indexed player2)",
  getPackBattle:
    "function getBattle(uint256 battleId) view returns (address player1, address player2, uint256 packId, uint256 packPrice, uint256 entryFee, uint256 platformFee, uint8 status, uint256 revealDeadline, bool player1Revealed, bool player2Revealed, address winner, uint256 player1Value, uint256 player2Value, uint256 createdAt, uint256 expiresAt)",
  getRegattaBattle:
    "function getBattle(uint256 battleId) view returns (address player1, address player2, uint256 packId, uint256 packPrice, uint256 entryFee, uint256 platformFee, uint8 status, uint256 revealDeadline, bool player1Revealed, bool player2Revealed, address winner, bytes32 resultHash, uint256 skillDeadline, uint256 createdAt, uint256 expiresAt)",
};

const BATTLES = [
  { target: PACK_BATTLE, abi: abis.getPackBattle, feeLabel: "Battle Platform Fees" },
  { target: REGATTA, abi: abis.getRegattaBattle, feeLabel: "Regatta Race Fees" },
];

const toBigInt = (value: any) => BigInt(value?.toString?.() ?? value ?? 0);
const key = (value: any) => value?.toString?.() ?? String(value);
const toUsd = (value: bigint) => Number(value) / USDC_DECIMALS;
const isProtocolWallet = (address: string) => PROTOCOL_WALLETS.has(String(address).toLowerCase());

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addPackSales = (packId: any, usd: number) => {
    if (usd <= 0) return;
    dailyVolume.addUSDValue(usd);
    dailyFees.addUSDValue(usd, PACK_SALES_LABELS[key(packId)] ?? UNMAPPED_PACK_SALES_LABEL);
  };

  const packPurchaseLogs = (await options.getLogs({
    target: GACHA_PACKS,
    eventAbi: abis.packPurchased,
  })).filter(({ buyer }: any) => !BATTLE_CONTRACTS.has(String(buyer).toLowerCase()) && !isProtocolWallet(buyer));

  if (packPurchaseLogs.length > 0) {
    const paymentTypes = await options.api.multiCall({
      target: GACHA_PACKS,
      abi: abis.purchasePaymentType,
      calls: packPurchaseLogs.map(({ purchaseId }: any) => purchaseId),
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
      })
      : [];
    const priceByPackId = new Map<string, bigint>();
    uniquePackIds.forEach((packId: any, index: number) => {
      const pack = packConfigs[index];
      priceByPackId.set(key(packId), toBigInt(pack.price ?? pack[0]));
    });

    for (const packId of paidPackIds) {
      const price = priceByPackId.get(key(packId));
      if (!price) continue;
      addPackSales(packId, toUsd(price));
    }
  }

  // Each player's entry is 1.5 packs plus a 5% platform fee; the join buys three packs
  // (one per player and a bonus for the winner). Only users' entries are counted.
  for (const { target, abi, feeLabel } of BATTLES) {
    const battleJoinedLogs = await options.getLogs({ target, eventAbi: abis.battleJoined });
    if (battleJoinedLogs.length === 0) continue;
    const battles = await options.api.multiCall({
      target,
      abi,
      calls: battleJoinedLogs.map(({ battleId }: any) => battleId),
    });
    for (const battle of battles) {
      const entryFee = toBigInt(battle.entryFee ?? battle[4]);
      const platformFee = toBigInt(battle.platformFee ?? battle[5]);
      for (const player of [battle.player1 ?? battle[0], battle.player2 ?? battle[1]]) {
        if (isProtocolWallet(player)) continue;
        addPackSales(battle.packId ?? battle[2], toUsd(entryFee - platformFee));
        if (platformFee > 0n) dailyFees.addUSDValue(toUsd(platformFee), feeLabel);
      }
    }
  }

  const marketplaceSales = await options.getLogs({
    target: MARKETPLACE_ESCROW,
    eventAbi: abis.sale,
  });
  for (const { price, fee } of marketplaceSales as any[]) {
    const salePriceUsd = toUsd(toBigInt(price));
    const feeUsd = toUsd(toBigInt(fee));
    if (salePriceUsd > 0) dailyVolume.addUSDValue(salePriceUsd);
    if (feeUsd > 0) {
      dailyFees.addUSDValue(feeUsd, "Marketplace Fees");
    }
  }

  const buybackLogs = await options.getLogs({
    target: BUYBACK,
    eventAbi: abis.buybackExecuted,
  });
  for (const { seller, price } of buybackLogs as any[]) {
    if (isProtocolWallet(seller)) continue;
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
    "Paid pack purchase volume, including users' pack battle and Regatta race entries net of the platform fee, plus marketplace sale volume. Protocol-owned wallets are excluded.",
  Fees:
    "Net fees from paid Pokemon and One Piece pack sales, pack battle and Regatta race platform fees, and marketplace fees, minus instant pack buyback payouts. Entries, pack buys and sell-backs by protocol-owned wallets are excluded.",
  UserFees:
    "Net fees from paid Pokemon and One Piece pack sales, pack battle and Regatta race platform fees, and marketplace fees, minus instant pack buyback payouts. Entries, pack buys and sell-backs by protocol-owned wallets are excluded.",
  Revenue:
    "Protocol revenue from paid pack sales, pack battle and Regatta race platform fees, and marketplace fees, net of instant pack buyback payouts.",
  ProtocolRevenue:
    "Protocol revenue from paid pack sales, pack battle and Regatta race platform fees, and marketplace fees, net of instant pack buyback payouts.",
  SupplySideRevenue:
    "No supply-side revenue is reported by this adapter.",
};

const commonBreakdown = {
  "Pokemon Pack Sales": "Paid Pokemon pack purchases (GachaPacks packs 0 and 1), including users' pack battle entries net of the platform fee. Coupon redemptions are excluded.",
  "One Piece Pack Sales": "Paid One Piece pack purchases (GachaPacks pack 2, live since 2026-10-07), including users' Regatta race entries net of the platform fee. Coupon redemptions are excluded.",
  [UNMAPPED_PACK_SALES_LABEL]: "Paid purchases of GachaPacks packs not yet mapped to a game.",
  "Battle Platform Fees": "5% platform fee each user pays to enter a pack battle, counted when the battle is joined.",
  "Regatta Race Fees": "5% platform fee each user pays to enter a Regatta pack race, counted when the race is joined.",
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
