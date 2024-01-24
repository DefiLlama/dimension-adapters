import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";
import { getPrices } from "../utils/prices";
import postgres from "postgres";
import * as ethers from "ethers";

interface IData {
  name: string;
  expires: number;
  cost: number;
  base_price: number;
  block_time: number;
}

const abi_event = {
  nameRegistered:"event NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 cost,uint256 expires)",
  nameRenewed: "event NameRenewed(string name,bytes32 indexed label,uint256 cost,uint256 expires)",
};
const abi_event_interface = new ethers.Interface(Object.values(abi_event));

const address_v4 = '283af0b28c62c092c9727f1ee09c02ca627eb7f5';
const address_v5 = '253553366da8546fc250f225fe3d25d0c782303b';

const fetch = (address: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const sql = postgres(process.env.INDEXA_DB!);
      try {

      const now = new Date(timestamp * 1e3)
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

      const logs_name_renewed = await sql`
        SELECT
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data,
          block_time,
          encode(topic_0, 'hex') AS topic_0,
          encode(topic_1, 'hex') AS topic_1
        FROM
          ethereum.event_logs
        WHERE
          block_number > 16695555
          AND encode(contract_address, 'hex') = ${address}
          AND topic_0 = '\\x3da24c024582931cfaf8267d8ed24d13a82a8068d5bd337d30ec45cea4e506ae'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `;

      const logs_name_registered = await sql`
        SELECT
          encode(transaction_hash, 'hex') AS HASH,
          encode(data, 'hex') AS data,
          block_time,
          encode(topic_0, 'hex') AS topic_0,
          encode(topic_1, 'hex') AS topic_1,
          encode(topic_2, 'hex') AS topic_2
        FROM
          ethereum.event_logs
        WHERE
          block_number > 16695555
          AND encode(contract_address, 'hex') = ${address}
          AND topic_0 = '\\xca6abbe9d7f11422cb6ca7629fbf6fe9efb1c621f71ce8f02b9f2a230097404f'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `
      const _cost:{[k: string]: number} = {}
      const raw_name_renewed = logs_name_renewed
        .map((e: any) => {return {...abi_event_interface.parseLog({topics: ['0x'+e.topic_0, '0x'+e.topic_1], data: '0x'+e.data}),...e}})
        .map((p: any) => {
            const expires = new BigNumber(p!.args.expires).toNumber()
            const cost = new BigNumber(p!.args.cost).div(1e18).toNumber()
            _cost[p.hash] = cost;
            return {
              expires: expires,
              cost: cost,
            } as IData
      });

      const raw_name_registered = logs_name_registered
        .map((e: any) => {return {...abi_event_interface.parseLog({topics: ['0x'+e.topic_0, '0x'+e.topic_1, '0x'+e.topic_2], data: '0x'+e.data}),...e}})
        .map((p: any) => {
          const name: string = p!.args.name;
          const expires = new BigNumber(p!.args.expires).toNumber()
          const cost = new BigNumber(p!.args.cost).div(1e18).toNumber()
          _cost[p.hash] = cost;
          return {
            expires: expires,
            cost: cost,
            name: name,
            base_price: (name.length === 3 && 640) || (name.length === 4 && 160) || 5,
            block_time: new Date(p.block_time).getTime() / 1000
          } as IData
    });

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const name_renewed_cost = raw_name_renewed.reduce((a: number, b: IData) => a+b.cost, 0);
    const name_registered_const = raw_name_registered.reduce((a: number, b: IData) => a+b.cost, 0);
    const dailyFees = (name_registered_const + name_renewed_cost) * ethPrice

    await sql.end({ timeout: 3 })
    return {
      timestamp: todaysTimestamp,
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString(),
    } as FetchResultFees

    } catch (error) {
      await sql.end({ timeout: 3 })
      throw error
    }
  }
}

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: async (timestamp: number) => {
          const fees_v4: FetchResultFees = await fetch(address_v4)(timestamp);
          const fees_v5: FetchResultFees = await fetch(address_v5)(timestamp);
          return {
            dailyFees: (Number(fees_v4.dailyFees) + Number(fees_v5.dailyFees)).toString(),
            dailyRevenue: (Number(fees_v4.dailyRevenue) + Number(fees_v5.dailyRevenue)).toString(),
            timestamp
          }
        },
        start: async ()  => 1677110400,
        meta: {
          methodology
        }
    },
  },

}

export default adapter;
