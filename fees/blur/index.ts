import { Adapter, FetchResultFees } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { ethers } from "ethers"
import * as sdk from "@defillama/sdk"
import postgres from "postgres"
import { getPrices } from "../../utils/prices";

const contract = "0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5"
const topic0_ex = "0xf2f66294df6fae7ac681cbe2f6d91c6904485929679dce263e8f6539b7d5c559";


import abi from "./abi.json";
const contract_interface = new ethers.Interface(abi);

interface ILog {
  data: string;
  contract_address: string;
  evt_block_time: string;
  tx_hash: string;
  topic0: string;
}

const unpackTypePriceCollection = (packedValue: any): any => {
  packedValue /= BigInt(2) ** BigInt(160);

  let price = packedValue % BigInt(2) ** BigInt(88);
  packedValue /= BigInt(2) ** BigInt(88);


  return price;
};

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const sql = postgres(process.env.INDEXA_DB!);
  try {

    const now = new Date(timestamp * 1e3);
    const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
    const logs: ILog[] = (await sql`
      SELECT
        '0x' || encode(data, 'hex') AS data,
        '0x' || encode(contract_address, 'hex') AS contract_address,
        '0x' || encode(transaction_hash, 'hex') AS tx_hash,
        '0x' || encode(topic_0, 'hex') AS topic0
      FROM
        ethereum.event_logs
      WHERE
        block_number > 13733671
        AND topic_0 in (
          '\\xf2f66294df6fae7ac681cbe2f6d91c6904485929679dce263e8f6539b7d5c559',
          '\\x1d5e12b51dee5e4d34434576c3fb99714a85f57b0fd546ada4b0bddd736d12b2',
          '\\x0fcf17fac114131b10f37b183c6a60f905911e52802caeeb3e6ea210398b81ab',
          '\\x7dc5c0699ac8dd5250cbe368a2fc3b4a2daadb120ad07f6cccea29f83482686e'
        )
        and contract_address = '\\xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5'
        AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `) as ILog[];

    const fees_ex = logs.filter((e: ILog) => e.topic0.toLowerCase() === topic0_ex.toLowerCase()).map((log: ILog) => {
      const parsedLog = contract_interface.parseLog({
        data: log.data,
        topics: [log.topic0]
      });
      const rate = Number(parsedLog!.args.fees.takerFee.rate || 0) / 1e4;
      const price = Number(parsedLog!.args.price) / 1e18;
      return rate * price;
    })
      .filter((e: number) => !isNaN(e))
      .reduce((a: number, b: number) => a + b, 0);


      const unpackFee = (packedValue: any) => {

        let recipient = packedValue % BigInt(2) ** BigInt(160);
        packedValue /= BigInt(2) ** BigInt(160);

        let rate = packedValue;

        return [rate, recipient.toString(16)];
      };
    const fees = logs.filter((e: ILog) => e.topic0.toLowerCase() !== topic0_ex.toLowerCase()).map((log: ILog) => {
      const parsedLog = contract_interface.parseLog({
        data: log.data,
        topics: [log.topic0]
      });
      const takerFeeRecipientRate = parsedLog!.args?.takerFeeRecipientRate;
      const makerFeeRecipientRate = parsedLog!.args?.makerFeeRecipientRate;
      const collectionPriceSide = parsedLog!.args?.collectionPriceSide;
      if (takerFeeRecipientRate === undefined && makerFeeRecipientRate === undefined) return 0;
      const price = unpackTypePriceCollection(BigInt(collectionPriceSide));
      const [rate, recipient] =
      takerFeeRecipientRate !== undefined
        ? unpackFee(BigInt(takerFeeRecipientRate))
        : unpackFee(BigInt(makerFeeRecipientRate));
      const _rate = rate.toString() / 1e4;
      const _price = price.toString() / 1e18;
      return _rate * _price;
    }).filter((e: number) => !isNaN(e))
    .reduce((a: number, b: number) => a + b, 0);
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const _fees = fees + fees_ex;
    const dailyFees = _fees * ethPrice;
    await sql.end({ timeout: 5 })
    return {
      dailyFees: dailyFees.toString(),
      timestamp
    }
  } catch (e) {
    await sql.end({ timeout: 5 })
    console.error(e)
    throw e;
  }

}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: async () => 1688256000
    }
  }
}
export default adapter
