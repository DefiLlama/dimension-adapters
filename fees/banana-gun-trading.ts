import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fethcFeesSolana = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '47hEzz83VFR23rLTEeVm9A7eFzjJwjvdupPPmX3cePqF' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const contract_address: any = {
  [CHAIN.BLAST]: '0x461efe0100be0682545972ebfc8b4a13253bd602',
  [CHAIN.BASE]: '0x1fba6b0bbae2b74586fba407fb45bd4788b7b130',
  [CHAIN.ETHEREUM]: '0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49',
  [CHAIN.SONIC]: '0xdc13700db7f7cda382e10dba643574abded4fd5b',
  [CHAIN.BSC]: '0x461efe0100be0682545972ebfc8b4a13253bd602',
  [CHAIN.UNICHAIN]: '0x461efe0100be0682545972ebfc8b4a13253bd602'
}

const fetchFees = async (_: any, _1: any, options: FetchOptions) => {
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
    dailyFees,
    dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: '2023-06-01',
    },
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2023-06-01',
    },
    [CHAIN.BLAST]: {
      fetch: fetchFees,
      start: '2023-06-01',
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2023-06-01',
    },
    [CHAIN.SONIC]: {
      fetch: fetchFees,
      start: '2024-12-16',
    },
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2024-03-15',
    },
    [CHAIN.UNICHAIN]: {
      fetch: fetchFees,
      start: '2025-02-10',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
