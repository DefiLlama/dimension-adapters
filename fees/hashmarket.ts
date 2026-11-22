import type { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Hashmarket mainnet factories and built-in NFT marketplaces: https://hashmarket.xyz/docs
const config: Record<string, { start: string; factoryBlock: number; factory: string; marketplace: string }> = {
  [CHAIN.BASE]: {
    start: '2026-11-20',
    factoryBlock: 60072116,
    factory: '0x3bc54467b3e6942e471ac01ae3cf85f82f3b6159',
    marketplace: '0x72b74cb6ad4326de2908c870953086b394b1a173',
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-11-20',
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
  const deployment = config[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  const toBlock = await options.getToBlock();
  if (toBlock < deployment.factoryBlock) return result;
  const fromBlock = Math.max(deployment.factoryBlock, await options.getFromBlock());
  if (fromBlock > toBlock) return result;

  const created = await options.getLogs({
    target: deployment.factory,
    eventAbi: 'event CollectionCreated(address indexed creator, address indexed collection, address indexed store, uint32 maxSupply)',
    fromBlock: deployment.factoryBlock,
    toBlock,
    cacheInCloud: true,
  });
  const targets = [...new Set<string>(created.map(log => log.collection.toLowerCase()))];
  const window = { fromBlock, toBlock };

  function addFees(label: string, platform: bigint, creator: bigint, rent = 0n) {
    dailyFees.addGasToken(platform + creator + rent, label);
    dailyRevenue.addGasToken(platform, treasuryFees);
    dailySupplySideRevenue.addGasToken(creator, creatorFees);
    dailySupplySideRevenue.addGasToken(rent, tradingRent);
  }

  if (targets.length) {
    const commissions = await options.getLogs({
      ...window, targets, eventAbi: 'event FeesAccrued(uint256 platform, uint256 creatorFee)',
    });
    for (const log of commissions) addFees(collectionFees, BigInt(log.platform), BigInt(log.creatorFee));

    // The same royalty's platform and creator shares are already in FeesAccrued.
    const royalties = await options.getLogs({
      ...window, targets,
      eventAbi: 'event RoyaltyReceived(address indexed sender, uint256 amount, uint256 platform, uint256 creatorFee, uint256 rent)',
    });
    for (const log of royalties) addFees(royaltyRent, 0n, 0n, BigInt(log.rent));
  }

  const sales = await options.getLogs({
    ...window, target: deployment.marketplace,
    eventAbi: 'event SaleFees(address indexed collection, uint256 indexed tokenId, uint256 platformFee, uint256 creatorFee, uint256 rentFee)',
  });
  for (const log of sales) addFees(marketplaceFees, BigInt(log.platformFee), BigInt(log.creatorFee), BigInt(log.rentFee));
  return result;
}

const treasury = { [treasuryFees]: 'The exact ETH fee allocated to the protocol treasury on accrual, before withdrawal.' };
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: config,
  fetch,
  methodology: {
    Fees: 'Native ETH commissions accrued on factory-created NFT collections, royalties actually paid into those collections, and fees charged by the built-in NFT marketplace. Excludes gross sale amounts, the non-fee mint allocation to rent, gas, unsolicited rent deposits, fee withdrawals, and NFT burn payouts.',
    Revenue: 'Only the treasury share of emitted fees, on an accrual basis.',
    ProtocolRevenue: 'Equal to treasury revenue. Hashmarket has no protocol token.',
    SupplySideRevenue: 'Creator commissions and the rent share of trade fees or paid royalties. Collection NFTs are not Hashmarket governance tokens.',
  },
  breakdownMethodology: {
    Fees: {
      [collectionFees]: 'Platform and creator amounts in FeesAccrued from collection mints and paid royalties.',
      [marketplaceFees]: 'Platform, creator, and rent amounts from marketplace SaleFees; excludes the seller proceeds.',
      [royaltyRent]: 'Only the rent part of RoyaltyReceived; the other shares are already counted in FeesAccrued.',
    },
    Revenue: treasury,
    ProtocolRevenue: treasury,
    SupplySideRevenue: {
      [creatorFees]: 'ETH allocated to collection creators by FeesAccrued and marketplace SaleFees.',
      [tradingRent]: 'ETH allocated to collection rent by marketplace SaleFees or external RoyaltyReceived; later payouts are not new fees.',
    },
  },
};

export default adapter;
