import { FetchResultFees, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { queryFlipside } from "../../helpers/flipsidecrypto";

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
interface ITransfer {
  data: string;
  contract: string;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
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
      calls: Array.from(Array(Number(poolLength)).keys()).map((i: any) => ({
        target: vault_factory,
        params: i,
      })),
      chain: chain
    }))

    const vaults_address = vaultRes.output
      .map(({ output }: any) => output).flat().map((e: string) => e.toLowerCase());

    const query_tx_event_deposit = `
      SELECT data, contract_address from arbitrum.core.fact_event_logs
      WHERE topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      and tx_hash in (SELECT tx_hash from arbitrum.core.fact_event_logs
        WHERE topics[0] = '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7'
        and contract_address in (${vaults_address.map((a: string) => `'${a.toLowerCase()}'`).join(',')})
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock})
      and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
    `
    console.log(query_tx_event_deposit);

    const query_tx_event_raw: ITransfer[] = (await queryFlipside(query_tx_event_deposit)).map(([data, contract_address]: [string, string]) => {
      return {
        contract: contract_address,
        data: data
      } as ITransfer
    })
    const coins: string[] = [...new Set(query_tx_event_raw.map((e: ITransfer) => `${CHAIN.ARBITRUM}:${e.contract}`))];
    const prices = await getPrices(coins, timestamp);
  
    const dailyVolume = query_tx_event_raw.map((e: ITransfer) => {
      const price = prices[`${CHAIN.ARBITRUM}:${e.contract}`].price;
      const decimals = prices[`${CHAIN.ARBITRUM}:${e.contract}`].decimals;
      return (Number(e.data) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a + b, 0);
  
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp
    }
  }
}

export default fetch;
