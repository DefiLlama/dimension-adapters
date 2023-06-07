import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { queryFlipside } from "../helpers/flipsidecrypto";

const topic0 = '0x4c48fdcd7e3cb84b81aa54aa5dd04105736ae1bc179d84611c6fa5a642e803f2';

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ARBITRUM]: '0x225acf1d32f0928a96e49e6110aba1fdf777c85f',
}

const vault_factory = '0x984e0eb8fb687afa53fc8b33e12e04967560e092';

const abis: any = {
  getVaults: {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "index",
            "type": "uint256"
        }
    ],
    "name": "getVaults",
    "outputs": [
        {
            "internalType": "address[]",
            "name": "vaults",
            "type": "address[]"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  marketIndex: {
    "inputs": [],
    "name": "marketIndex",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  }
}

interface ITx {
  data: string;
  transactionHash: string;
}


const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const startblock = (await getBlock(fromTimestamp, chain, {}));
    const endblock = (await getBlock(toTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: address[chain],
      topic: '',
      fromBlock: startblock,
      toBlock: endblock,
      topics: [topic0],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const poolLength = (await sdk.api.abi.call({
      target: vault_factory,
      chain: chain,
      abi: abis.marketIndex,
    })).output;

    const vaultRes = (await sdk.api.abi.multiCall({
      abi: abis.getVaults,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: vault_factory,
        params: i,
      })),
      chain: chain
    }))

    const vaults_address = vaultRes.output
      .map(({ output }) => output).flat().map((e: string) => e.toLowerCase());


    const query = `
      SELECT tx_hash from arbitrum.core.fact_event_logs
      WHERE topics[0] = '0xbbbdee62287b5bf3bee13cab60a29ad729cf38109bccbd2a986a11c99b8ca704'
      and contract_address in (${vaults_address.map(a => `'${a.toLowerCase()}'`).join(',')})
      and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
    `

    const value: string[] = (await queryFlipside(query)).flat();
    const query_tx_ether = `
      SELECT data from arbitrum.core.fact_event_logs
      WHERE topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      and topics[2] = '0x0000000000000000000000005c84cf4d91dc0acde638363ec804792bb2108258'
      and contract_address = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
      and tx_hash in (${value.map(a => `'${a.toLowerCase()}'`).join(',')})
      and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
    `
    const ether_tx_value: string[] = (await queryFlipside(query_tx_ether)).flat();
    const withdrawFeesAmount: number = ether_tx_value.map((e: string) => Number(e) / 1e18).reduce((a: number, b: number) => a + b, 0)


    const rawLogsData: number[] = logs.map((tx: ITx) => {
      const insrFinalTvl = Number('0x' + tx.data.slice(256, 320)) / 10 **  18; // 4
      const riskFinalTvl = Number('0x' + tx.data.slice(128, 192)) / 10 **  18; // 2
      const isDisaster =  Number('0x' + tx.data.slice(320, 384)); // 5
      return isDisaster === 1 ? riskFinalTvl : insrFinalTvl
    });
    const dailyFee = rawLogsData.reduce((a: number, b: number) => a+b,0)
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    const withdrawFeesAmountUSD = withdrawFeesAmount * ethPrice;
    const dailyFeesUSD = (dailyFee * ethPrice) * 0.05;
    const dailyFees = dailyFeesUSD+withdrawFeesAmountUSD;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString(),
      timestamp
    }
  }
}

const methodology = {
  Fees: "5% of Hedge Vault deposits, 5% of Risk Vault deposits upon a depeg event and withdraw fees" ,
  Revenue: "5% of Hedge Vault deposits, 5% of Risk Vault deposits upon a depeg event and withdraw fees",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1675382400,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
