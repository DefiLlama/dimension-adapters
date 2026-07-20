import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived } from "../helpers/token";

interface IFee {
  isMarketplaceFees: boolean;
  volume: number;
}

const royalty_engine = '0x6170b3c3a54c3d8c854934cbc314ed479b2b29a3';
const marketplace_address_fees = '0xd1d1d4e36117ab794ec5d4c78cbd3a8904e691d0';
const fetch: any = async (options: FetchOptions) => {

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: royalty_engine,
    eventAbi: 'event RoyaltyPayout(address indexed tokenContract, uint256 indexed tokenId, address indexed recipient, uint256 amount)',
  });


  const log = logs.map((p: any) => {
    return {
      volume: Number(p.amount),
      isMarketplaceFees: p.recipient.toLowerCase() === marketplace_address_fees.toLowerCase(),
    } as IFee
  });


  const royalties_fees = log.filter((e: IFee) => !e.isMarketplaceFees)
    .reduce((a: number, b: IFee) => a + b.volume, 0)
  const marketplace_fees = log.filter((e: IFee) => e.isMarketplaceFees)
    .reduce((a: number, b: IFee) => a + b.volume, 0)


  const dailyMintFees = await addGasTokensReceived({
    options,
    multisig: '0xd1d1d4e36117ab794ec5d4c78cbd3a8904e691d0',
    blacklist_fromAddresses: ['0xf2989961Bf987bdD6c86CD6B845B6fACa194a8e4']
  })

  dailyFees.addGasToken(royalties_fees+marketplace_fees);
  dailyRevenue.addGasToken(marketplace_fees);

  dailyFees.addBalances(dailyMintFees);
  dailyRevenue.addBalances(dailyMintFees);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  } as FetchResultFees

}

const methodology = {
  Fees: "All royalties + marketplace + mint fees",
  Revenue: "Marketplace fees + mint fees",
}

const adapter: Adapter = {
  version:2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2022-12-01',
  methodology,
}

export default adapter;
