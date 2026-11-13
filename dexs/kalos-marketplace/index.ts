import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";
import { kalosReferralExclusion } from "../../helpers/kalos";
import { getPositionedLogArgs, PositionedLogArgs } from "../../helpers/logs";

// Kalos Marketplace (https://www.kalos.fun) on Kinetiq Elysium. KalosMarket (proxy) is TreasureMarketplace b2cc323 with
// a Kalos patch for native payouts (implementation 0xCa105Aa6264C0816c808a19A8Eec98A789eb8D3F). On every sale it pays
// fee() (or feeWithCollectionOwner() when the collection has a creator fee), both 50 bps = 0.5%, to feeReceipient(),
// the Kalos revenue splitter, and the collection's creator fee (collectionToCollectionOwnerFee) to its creator.
// Fees: https://www.kalos.fun/learn/fees. Offers are not escrowed (WHYPE allowances), so the contract holds no funds.
const KALOS_MARKET = '0x88d6d065789C1Fc2FD96d5c88E3B709c862fD05a';
const KALOS_MARKET_START = '2026-11-06';
// KalosMarket proxy deployed and initialized in this block (initialize() calls setFee, which emits UpdateFee)
const KALOS_MARKET_DEPLOY_BLOCK = 1_197_313;
const BASIS_POINTS = 10_000n;

const ItemSoldEvent = 'event ItemSold(address seller, address buyer, address nftAddress, uint256 tokenId, uint64 quantity, uint128 pricePerItem, address paymentToken)';
const BidAcceptedEvent = 'event BidAccepted(address seller, address bidder, address nftAddress, uint256 tokenId, uint64 quantity, uint128 pricePerItem, address paymentToken, uint8 bidType)';
// fee settings changes, each carrying the new value: setFee (also called by initialize) and setCollectionOwnerFee are the
// only writes to fee, feeWithCollectionOwner and collectionToCollectionOwnerFee, so these events rebuild them exactly
const UpdateFeeEvent = 'event UpdateFee(uint256 fee)';
const UpdateFeeWithCollectionOwnerEvent = 'event UpdateFeeWithCollectionOwner(uint256 fee)';
const UpdateCollectionOwnerFeeEvent = 'event UpdateCollectionOwnerFee(address _collection, address _recipient, uint256 _fee)';
const NO_OWNER_FEE = { fee: 0n, recipient: ADDRESSES.null };

type OwnerFee = { fee: bigint, recipient: string };
type Change<T> = { at: PositionedLogArgs, value: T };

const isBefore = (a: PositionedLogArgs, b: PositionedLogArgs) => a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && a.logIndex < b.logIndex);
const byPosition = (a: PositionedLogArgs, b: PositionedLogArgs) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

/** The value in effect at a log: the last change before it, else `initial` */
function valueAt<T>(initial: T, changes: Change<T>[], at: PositionedLogArgs): T {
  let value = initial;
  for (const change of changes) {
    if (!isBefore(change.at, at)) break;
    value = change.value;
  }
  return value;
}

/** Every change of a fee setting from deployment to the window's end, in (block, log index) order: a small config scan, cached */
async function settingsHistory(options: FetchOptions, eventAbi: string): Promise<PositionedLogArgs[]> {
  const logs = await getPositionedLogArgs(options, {
    target: KALOS_MARKET,
    eventAbi,
    fromBlock: KALOS_MARKET_DEPLOY_BLOCK,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });
  return logs.sort(byPosition);
}

const LABELS = {
  MARKETPLACE: 'Marketplace Fees',
  MARKETPLACE_PROTOCOL: 'Marketplace Fees To Protocol',
  CREATOR: METRIC.CREATOR_FEES,
  CREATOR_CREATORS: 'Creator Fees To Creators',
};

/** NFT sales on KalosMarket in the window, with the KalosMarket fee and the creator fee of each sale */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // listings bought (ItemSold) and offers accepted (BidAccepted)
  const sold = await getPositionedLogArgs(options, { target: KALOS_MARKET, eventAbi: ItemSoldEvent });
  const accepted = await getPositionedLogArgs(options, { target: KALOS_MARKET, eventAbi: BidAcceptedEvent });
  const sales = [...sold, ...accepted];
  if (!sales.length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // the fee settings in effect at each sale, rebuilt from their change events (no state reads); both market fees have been
  // 50 bps = 0.5% since deployment
  const feeChanges: Change<bigint>[] = (await settingsHistory(options, UpdateFeeEvent)).map((log) => ({ at: log, value: BigInt(log.fee) }));
  const feeWithCollectionOwnerChanges: Change<bigint>[] = (await settingsHistory(options, UpdateFeeWithCollectionOwnerEvent)).map((log) => ({ at: log, value: BigInt(log.fee) }));
  if (!feeChanges.length || !feeWithCollectionOwnerChanges.length) throw new Error('kalos-marketplace: fee history missing (initialize emits UpdateFee)');
  const ownerFeeChanges: Record<string, Change<OwnerFee>[]> = {};
  (await settingsHistory(options, UpdateCollectionOwnerFeeEvent)).forEach((log) => {
    const collection = String(log._collection).toLowerCase();
    (ownerFeeChanges[collection] ??= []).push({ at: log, value: { fee: BigInt(log._fee), recipient: String(log._recipient).toLowerCase() } });
  });

  for (const sale of sales) {
    const total = BigInt(sale.quantity) * BigInt(sale.pricePerItem);
    const collection = String(sale.nftAddress).toLowerCase();
    const owner = valueAt<OwnerFee>(NO_OWNER_FEE, ownerFeeChanges[collection] ?? [], sale);
    const hasOwner = owner.recipient !== ADDRESSES.null;
    const marketplaceFee = total * valueAt(0n, hasOwner ? feeWithCollectionOwnerChanges : feeChanges, sale) / BASIS_POINTS;
    const creatorFee = hasOwner ? total * owner.fee / BASIS_POINTS : 0n;
    dailyVolume.add(sale.paymentToken, total);
    dailyFees.add(sale.paymentToken, marketplaceFee, LABELS.MARKETPLACE);
    dailyRevenue.add(sale.paymentToken, marketplaceFee, LABELS.MARKETPLACE_PROTOCOL);
    dailyFees.add(sale.paymentToken, creatorFee, LABELS.CREATOR);
    dailySupplySideRevenue.add(sale.paymentToken, creatorFee, LABELS.CREATOR_CREATORS);
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const REFERRAL_EXCLUSION = kalosReferralExclusion('the Kalos marketplace');

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: KALOS_MARKET_START,
  methodology: {
    Volume: 'Value of NFTs sold on the Kalos marketplace, from bought listings and accepted offers.',
    Fees: "Fees charged on Kalos marketplace NFT sales: the 0.5% marketplace fee plus the collection creator's royalty, where the creator set one.",
    UserFees: "Fees charged on Kalos marketplace NFT sales, taken out of the sale price: the 0.5% marketplace fee plus the collection creator's royalty, where the creator set one.",
    Revenue: `The 0.5% marketplace fee on Kalos marketplace NFT sales, kept by Kalos. ${REFERRAL_EXCLUSION}`,
    ProtocolRevenue: `The 0.5% marketplace fee on Kalos marketplace NFT sales, sent to Kalos's own vaults and referral pool. ${REFERRAL_EXCLUSION}`,
    SupplySideRevenue: 'Creator royalties on Kalos marketplace NFT sales, paid to the collection creators.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.MARKETPLACE]: 'The 0.5% Kalos marketplace fee on NFT sales and accepted offers.',
      [LABELS.CREATOR]: "The royalty set by a collection's creator, charged on Kalos marketplace sales of that collection.",
    },
    UserFees: {
      [LABELS.MARKETPLACE]: 'The 0.5% Kalos marketplace fee on NFT sales and accepted offers, taken out of the sale price.',
      [LABELS.CREATOR]: "The royalty set by a collection's creator, taken out of the sale price on Kalos marketplace sales of that collection.",
    },
    Revenue: { [LABELS.MARKETPLACE_PROTOCOL]: 'All Kalos marketplace fees, kept by Kalos.' },
    ProtocolRevenue: { [LABELS.MARKETPLACE_PROTOCOL]: "All Kalos marketplace fees, sent to Kalos's own vaults and referral pool." },
    SupplySideRevenue: { [LABELS.CREATOR_CREATORS]: 'Creator royalties on Kalos marketplace sales, paid to the collection creators.' },
  },
};

export default adapter;
