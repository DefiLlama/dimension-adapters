import type { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Hashmarket mainnet factories and built-in NFT marketplaces: https://hashmarket.xyz/docs
const config: Record<string, { start: string; factoryBlock: number; factory: string; marketplace: string }> = {
  [CHAIN.BASE]: {
    start: '2026-11-20T20:00:00Z',
    factoryBlock: 60072116,
    factory: '0x3bc54467b3e6942e471ac01ae3cf85f82f3b6159',
    marketplace: '0x72b74cb6ad4326de2908c870953086b394b1a173',
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-11-20T20:00:00Z',
    factoryBlock: 119317776,
    factory: '0x29367d569f5f2fa7f2bc2fc9d3da034cb5461c7a',
    marketplace: '0x90766b16c11e6deb8178400bd57b4ee2125095ea',
  },
};

const collectionFees = 'NFT mint and royalty commissions';
const marketplaceFees = 'NFT marketplace fees';
const royaltyRent = 'External NFT royalties allocated to rent';
const creatorFees = 'Fees to NFT creators';
const tradingRent = 'Trading fees allocated to NFT rent';
const treasuryFees = 'Fees to treasury';

async function fetch(options: FetchOptions) {
  const { factory, factoryBlock, marketplace } = config[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const created = await options.getLogs({
    target: factory,
    eventAbi: 'event CollectionCreated(address indexed creator, address indexed collection, address indexed store, uint32 maxSupply)',
    fromBlock: factoryBlock,
    cacheInCloud: true,
  });
  const targets = [...new Set<string>(created.map(log => log.collection.toLowerCase()))];

  function addFees(label: string, platform: bigint, creator: bigint, rent = 0n) {
    dailyFees.addGasToken(platform + creator + rent, label);
    dailyRevenue.addGasToken(platform, treasuryFees);
    dailySupplySideRevenue.addGasToken(creator, creatorFees);
    dailySupplySideRevenue.addGasToken(rent, tradingRent);
  }

  if (targets.length) {
    const commissions = await options.getLogs({
      targets, eventAbi: 'event FeesAccrued(uint256 platform, uint256 creatorFee)',
    });
    for (const log of commissions) addFees(collectionFees, BigInt(log.platform), BigInt(log.creatorFee));

    // The same royalty's platform and creator shares are already in FeesAccrued.
    const royalties = await options.getLogs({
      targets,
      eventAbi: 'event RoyaltyReceived(address indexed sender, uint256 amount, uint256 platform, uint256 creatorFee, uint256 rent)',
    });
    for (const log of royalties) addFees(royaltyRent, 0n, 0n, BigInt(log.rent));
  }

  const sales = await options.getLogs({
    target: marketplace,
    eventAbi: 'event SaleFees(address indexed collection, uint256 indexed tokenId, uint256 platformFee, uint256 creatorFee, uint256 rentFee)',
  });
  for (const log of sales) addFees(marketplaceFees, BigInt(log.platformFee), BigInt(log.creatorFee), BigInt(log.rentFee));
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const treasury = { [treasuryFees]: 'Hashmarket platform cut of NFT mint commissions, royalties paid into its collections from other marketplaces, and Hashmarket marketplace sale fees, counted when it accrues to the treasury rather than when withdrawn.' };
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: config,
  fetch,
  methodology: {
    Fees: 'ETH fees on NFT collections created through the Hashmarket factory: mint commissions, royalties paid into those collections from other marketplaces, and fees on sales in the Hashmarket marketplace. Seller proceeds, the part of the mint price that funds collection rent, and direct deposits to rent are not fees.',
    Revenue: 'Hashmarket platform cut of NFT mint commissions, royalties paid into its collections from other marketplaces, and Hashmarket marketplace sale fees; creator and rent shares are excluded.',
    ProtocolRevenue: 'Hashmarket platform cut of NFT mint commissions, royalties paid into its collections from other marketplaces, and Hashmarket marketplace sale fees, all kept by the Hashmarket treasury. Hashmarket has no token, so nothing goes to holders.',
    SupplySideRevenue: 'Creator share of NFT mint commissions, royalties paid into the collections from other marketplaces, and Hashmarket marketplace sale fees, plus the rent share of marketplace sale fees and royalties that is added to collection rent.',
  },
  breakdownMethodology: {
    Fees: {
      [collectionFees]: 'Treasury and creator shares of commissions on NFT mints and on royalties paid into the collection from other marketplaces.',
      [marketplaceFees]: 'Treasury, creator and rent fees taken on each NFT sale in the Hashmarket marketplace; seller proceeds are excluded.',
      [royaltyRent]: 'Rent share of royalties paid into the collection from other marketplaces; the treasury and creator shares of the same royalties are counted under NFT mint and royalty commissions.',
    },
    Revenue: treasury,
    ProtocolRevenue: treasury,
    SupplySideRevenue: {
      [creatorFees]: 'Creator share of NFT mint commissions, royalties paid into the collection from other marketplaces, and Hashmarket marketplace sale fees.',
      [tradingRent]: 'Rent share of Hashmarket marketplace sale fees and of royalties paid into the collection from other marketplaces, added to collection rent. Later payouts from rent are not counted again.',
    },
  },
};

export default adapter;
