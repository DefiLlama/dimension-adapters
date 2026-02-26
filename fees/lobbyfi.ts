import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const methodology = {
  Fees: 'Total fees paid by delegations buyers.',
  SupplySideRevenue: 'Total fees are distributed to token delegators.',
  ProtocolRevenue: 'Commission fees earned by Loobyfi.',
}

const eventAbis = {
  commissionRate: 'uint256:commissionRate',
  InstantBuyExecuted: "event InstantBuyExecuted(bytes32 proposalId, uint8 support, uint256 netRevenue)",
  AuctionExecuted: "event AuctionExecuted(bytes32 proposalId, uint8 winningSupport, uint256 netRevenue)",
}

const contracts: any = {
  [CHAIN.ARBITRUM]: '0x04baFD4206D386Bbe2EBf6Cc0e9d120712C6AbE8',
  [CHAIN.ERA]: '0xa46e5B8Fec15916d89e265E5F7d10e3CCd8D1D81',
  [CHAIN.MANTA]: '0x04bafd4206d386bbe2ebf6cc0e9d120712c6abe8',
  [CHAIN.BLAST]: '0xbb2c60e16e0b1c3872564af7676a68fe987ab591',
  [CHAIN.OPTIMISM]: '0x04baFD4206D386Bbe2EBf6Cc0e9d120712C6AbE8',
  [CHAIN.SCROLL]: '0x04bafd4206d386bbe2ebf6cc0e9d120712c6abe8',
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const commissionRate = Number((await options.api.call({
    target: contracts[options.chain],
    abi: eventAbis.commissionRate,
  }))) / 1e4

  const InstantBuyExecutedEvents = await options.getLogs({
    eventAbi: eventAbis.InstantBuyExecuted,
    target: contracts[options.chain],
  })
  const AuctionExecutedEvents = await options.getLogs({
    eventAbi: eventAbis.InstantBuyExecuted,
    target: contracts[options.chain],
  })
  for (const event of InstantBuyExecutedEvents.concat(AuctionExecutedEvents)) {
    const totalRevenue = Number(event.netRevenue) / commissionRate
    dailyFees.addGasToken(totalRevenue)
    dailySupplySideRevenue.addGasToken(Number(event.netRevenue))
  }

  const dailyProtocolRevenue = dailyFees.clone()
  dailyProtocolRevenue.subtract(dailySupplySideRevenue)

  return {
    dailyFees,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  methodology,
  fetch,
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2024-01-26', },
    [CHAIN.ERA]: { start: '2024-06-27', },
    [CHAIN.MANTA]: { start: '2024-07-01', },
    [CHAIN.BLAST]: { start: '2024-07-01', },
    [CHAIN.OPTIMISM]: { start: '2024-07-01', },
    [CHAIN.SCROLL]: { start: '2024-10-20', },
  }
}

export default adapter;
