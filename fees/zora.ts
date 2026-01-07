import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryIndexer } from "../helpers/indexer";
import { addGasTokensReceived } from "../helpers/token";

interface IFee {
  isMarketplaceFees: boolean;
  volume: number;
}

interface IMintFee {
  volume: number;
}

const marketplace_address_fees = '0x000000000000000000000000d1d1d4e36117ab794ec5d4c78cbd3a8904e691d0';
const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await queryIndexer(`
    SELECT
      encode(transaction_hash, 'hex') AS HASH,
      encode(data, 'hex') AS data,
      encode(topic_3, 'hex') as topic_3
    FROM
      ethereum.event_logs
    WHERE
      contract_address = '\\x6170b3c3a54c3d8c854934cbc314ed479b2b29a3'
      and topic_0 = '\\x866e6ef8682ddf5f1025e64dfdb45527077f7be70fa9ef680b7ffd8cf4ab9c50'
      AND block_time BETWEEN llama_replace_date_range;
      `, options);

  const hash_sale: string[] = logs.map((e: any) => e.hash);

  const log = logs.map((p: any) => {
    const volume = Number('0x' + p.data)
    const contract_address = '0x' + p.topic_3
    return {
      volume: volume,
      isMarketplaceFees: contract_address.toLowerCase() === marketplace_address_fees.toLowerCase(),
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
    timestamp,
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
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-12-01',
    },
  },
  
  methodology,
}

export default adapter;
