import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { queryDune } from "../helpers/dune";
import { queryIndexer } from "../helpers/indexer";

const fetch: any = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const deployer = [
    "xf414d478934c29d9a80244a3626c681a71e53bb2", "x37aab97476ba8dc785476611006fd5dda4eed66b"
  ].map(i => `'\\${i}'::bytea`).join(', ')
  const transactions = await queryIndexer(`
      SELECT
        encode(data, 'hex') AS data
      FROM
        ethereum.event_logs
      WHERE
          block_number > 17345415
          AND contract_address IN (
              SELECT DISTINCT address
              FROM ethereum.traces
              WHERE
                  block_number > 17345415
                  AND from_address IN ( ${deployer} )
                  AND "type" = 'create'
                  and address is not null
          )
          AND topic_0 = '\\x72015ace03712f361249380657b3d40777dd8f8a686664cab48afd9dbbe4499f'
          AND block_time BETWEEN llama_replace_date_range;
    `, options)
  const dailyFees = options.createBalances();
  transactions.map((e: any) => {
    dailyFees.addGasToken(Number('0x' + e.data.slice(0, 64)));
  })
  return { dailyFees, dailyRevenue: dailyFees, timestamp }

}

interface IFees {
  block_date: string;
  feesSOL: number;
}

const fethcFeesSolana = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  try {
    const dateStr = new Date(todaysTimestamp * 1000).toISOString().split('T')[0];
    const value: IFees[] = (await queryDune("2685322"));
    const dayItem = value.find((item: any) => item.block_date.split(' ')[0] === dateStr);
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const fees = (dayItem?.feesSOL || 0) * 1e9;
    dailyFees.add('So11111111111111111111111111111111111111112', fees);
    dailyRevenue.add('So11111111111111111111111111111111111111112', fees) ;
    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyRevenue,
      timestamp
    }
  } catch (error: any) {
    return {
      dailyFees: "0",
      timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1685577600,
    },
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      runAtCurrTime: true,
      start: 1685577600,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
