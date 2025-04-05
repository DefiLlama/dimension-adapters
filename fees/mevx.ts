import { Chain } from "@defillama/sdk/build/general"
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import { queryFlipside } from "../helpers/flipsidecrypto";

interface IVolume {
  amount: number;
  tokenAddress: string;
  tx: string;
}

type TAddress = {
  [s: string | Chain]: string;
}

const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x087297b9987F16Ee251137b59D001aCf2457579e',
  [CHAIN.BASE]: '0x764B099A48187D5f27806C6739BDa0BEF90B69F9',
  [CHAIN.BSC]: '0xfA90769c3D13Feab848bfBC06A99a8B86B981dC6',

}

const graph = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getFromBlock, getToBlock, }: FetchOptions): Promise<FetchResultFees> => {

    const query = `
        select
          input_data,
          TX_HASH
        from
          ${chain}.core.fact_transactions
        WHERE
        BLOCK_NUMBER > ${await getFromBlock()} AND BLOCK_NUMBER < ${await getToBlock()}
        and to_address = '${address[chain]}'
        and status = 'SUCCESS'
      `


    const value: string[][] = (await queryFlipside(query, 260))
    const rawData = value.map((a: string[]) => {
      const data = a[0].replace('0x5f575529', '');
      const address = data.slice(64, 128);
      const amount = Number('0x' + data.slice(128, 192));
      const tokenAddress = '0x' + address.slice(24, address.length);
      return {
        amount: amount,
        tokenAddress: tokenAddress,
        tx: a[1]
      } as IVolume
    })
    const dailyFees = createBalances()

    rawData.map((e: IVolume) => {
      dailyFees.add(e.tokenAddress, e.amount)
    })

    dailyFees.resizeBy(0.0085)

    return {
      dailyFees: dailyFees,
      dailyProtocolRevenue: dailyFees,
      dailyRevenue: dailyFees,
      timestamp
    }

  }
}



const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    blacklists: ['3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A', 'BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ'],
    blacklist_signers: ['3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A', 'BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ'],
    options,
    targets: [
      "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A",
      "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ"
    ],
  });
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: '2025-01-01',
    },
    [CHAIN.BASE]: {
      fetch: graph(CHAIN.BASE),
      start: '2025-01-01',
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: '2025-01-01',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
