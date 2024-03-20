import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { queryDune } from "../helpers/dune";

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

const contract_address: any = {
  [CHAIN.BLAST]: '0x461efe0100be0682545972ebfc8b4a13253bd602',
  [CHAIN.BASE]: '0x1fba6b0bbae2b74586fba407fb45bd4788b7b130',
  [CHAIN.ETHEREUM]: '0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49',
}

const fetchFees = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({
    topic: '0x72015ace03712f361249380657b3d40777dd8f8a686664cab48afd9dbbe4499f',
    target: contract_address[options.chain],
  });
  logs.map((log: any) => {
    const data = log.data.replace('0x', '');
    const gasToken = data.slice(0, 64);
    dailyFees.addGasToken(Number('0x' + gasToken));
    dailyRevenue.addGasToken(Number('0x' + gasToken));
  });
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: 1685577600,
    },
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      runAtCurrTime: true,
      start: 1685577600,
    },
    [CHAIN.BLAST]: {
      fetch: fetchFees,
      start: 1685577600,
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: 1685577600,
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
