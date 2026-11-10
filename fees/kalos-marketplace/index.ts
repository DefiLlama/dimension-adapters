import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { KALOS_REFERRAL_NOTE } from "../../helpers/kalos";

// Kalos Marketplace (https://www.kalos.fun) on Kinetiq Elysium. KalosMarket (proxy) is TreasureMarketplace b2cc323 with
// a Kalos patch for native payouts (implementation 0xCa105Aa6264C0816c808a19A8Eec98A789eb8D3F). On every sale it pays
// fee() (or feeWithCollectionOwner() when the collection has a creator fee), both 50 bps = 0.5%, to feeReceipient(),
// the Kalos revenue splitter, and the collection's creator fee (collectionToCollectionOwnerFee) to its creator.
// Fees: https://www.kalos.fun/learn/fees. Offers are not escrowed (WHYPE allowances), so the contract holds no funds.
const KALOS_MARKET = '0x88d6d065789C1Fc2FD96d5c88E3B709c862fD05a';
const KALOS_MARKET_START = '2026-11-06';
const BASIS_POINTS = 10_000n;
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

const ItemSoldEvent = 'event ItemSold(address seller, address buyer, address nftAddress, uint256 tokenId, uint64 quantity, uint128 pricePerItem, address paymentToken)';
const BidAcceptedEvent = 'event BidAccepted(address seller, address bidder, address nftAddress, uint256 tokenId, uint64 quantity, uint128 pricePerItem, address paymentToken, uint8 bidType)';

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
  const sold = await options.getLogs({ target: KALOS_MARKET, eventAbi: ItemSoldEvent });
  const accepted = await options.getLogs({ target: KALOS_MARKET, eventAbi: BidAcceptedEvent });
  const sales = [...sold, ...accepted];
  if (!sales.length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // fee rates read at the window's end (both 50 bps = 0.5%)
  const [fee, feeWithCollectionOwner] = (await options.toApi.batchCall([
    { target: KALOS_MARKET, abi: 'uint256:fee' },
    { target: KALOS_MARKET, abi: 'uint256:feeWithCollectionOwner' },
  ])).map((value: any) => BigInt(value));
  const collections = [...new Set(sales.map((sale: any) => String(sale.nftAddress).toLowerCase()))];
  const ownerFees = await options.toApi.multiCall({
    target: KALOS_MARKET,
    abi: 'function collectionToCollectionOwnerFee(address) view returns (uint32 fee, address recipient)',
    calls: collections,
  });
  const ownerFeeOf: Record<string, { fee: bigint, recipient: string }> = {};
  collections.forEach((collection, i) => ownerFeeOf[collection] = { fee: BigInt(ownerFees[i].fee), recipient: String(ownerFees[i].recipient).toLowerCase() });

  for (const sale of sales) {
    const total = BigInt(sale.quantity) * BigInt(sale.pricePerItem);
    const owner = ownerFeeOf[String(sale.nftAddress).toLowerCase()];
    const hasOwner = owner.recipient !== NULL_ADDRESS;
    const marketplaceFee = total * (hasOwner ? feeWithCollectionOwner : fee) / BASIS_POINTS;
    const creatorFee = hasOwner ? total * owner.fee / BASIS_POINTS : 0n;
    dailyVolume.add(sale.paymentToken, total);
    dailyFees.add(sale.paymentToken, marketplaceFee, LABELS.MARKETPLACE);
    dailyRevenue.add(sale.paymentToken, marketplaceFee, LABELS.MARKETPLACE_PROTOCOL);
    dailyFees.add(sale.paymentToken, creatorFee, LABELS.CREATOR);
    dailySupplySideRevenue.add(sale.paymentToken, creatorFee, LABELS.CREATOR_CREATORS);
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: KALOS_MARKET_START,
  methodology: {
    Volume: 'NFT sales on KalosMarket: listings bought and offers accepted (quantity x price per item).',
    Fees: 'The 0.5% KalosMarket fee plus the collection creator fee on every sale.',
    UserFees: 'The 0.5% KalosMarket fee plus the collection creator fee on every sale, taken out of the sale price.',
    Revenue: 'The 0.5% KalosMarket fee, paid to the Kalos revenue splitter.',
    ProtocolRevenue: 'The 0.5% KalosMarket fee, paid to the Kalos revenue splitter, which pays it to the Kalos vaults and the KalosReferralPool. ' + KALOS_REFERRAL_NOTE,
    SupplySideRevenue: 'Creator fees paid to collection creators.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.MARKETPLACE]: 'The 0.5% KalosMarket fee on NFT sales and accepted offers.',
      [LABELS.CREATOR]: "The collection's creator fee on KalosMarket sales (collectionToCollectionOwnerFee).",
    },
    UserFees: {
      [LABELS.MARKETPLACE]: 'The 0.5% KalosMarket fee on NFT sales and accepted offers.',
      [LABELS.CREATOR]: "The collection's creator fee on KalosMarket sales.",
    },
    Revenue: { [LABELS.MARKETPLACE_PROTOCOL]: 'KalosMarket fees paid to the Kalos revenue splitter.' },
    ProtocolRevenue: { [LABELS.MARKETPLACE_PROTOCOL]: 'KalosMarket fees paid to the Kalos revenue splitter.' },
    SupplySideRevenue: { [LABELS.CREATOR_CREATORS]: 'Creator fees paid to collection creators on KalosMarket sales.' },
  },
};

export default adapter;
