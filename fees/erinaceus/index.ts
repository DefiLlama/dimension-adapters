import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { Chain } from "../../adapters/types";
import getTxReceipts from "../../helpers/getTxReceipts";
const sdk = require('@defillama/sdk')


const topic0_v2 = '0x221ad2e5b871cead1dd7f75c2fb223c0cfa34bdc049a15f3f82a1f0e943e605a';

type TAddrress = {
  [l: string | Chain]: string;
}


const address_v2: TAddrress = {
  [CHAIN.BAHAMUT]: '0x7fDBF4fe2DBBDf956C010b3dD83177CB86Eb1b14',
}

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}

type IGasTokenId = {
  [l: string | Chain]: string;
}
const gasTokenId: IGasTokenId = {
  [CHAIN.BAHAMUT]: "coingecko:fasttoken",
}


const fetch = (chain: Chain) => {
  return async ({ getFromBlock, getToBlock, toTimestamp }: FetchOptions) => {
    const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
    const logs_1: ITx[] = (await sdk.getEventLogs({
      target: address_v2[chain],
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_v2],
      chain: chain
    })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx });

    const amount_fullfill = logs_1.map((e: ITx) => {
      const payment = Number('0x' + e.data.slice(64, 128)) / 10 ** 18
      return payment;
    }).reduce((a: number, b: number) => a + b, 0);

    const tx_hash: string[] = [...new Set([...logs_1].map((e: ITx) => e.transactionHash))]
    const txReceipt: number[] = (await getTxReceipts(chain, tx_hash, { cacheKey: '' }))
      .map((e: any) => {
        const amount = (Number(e?.gasUsed || 0) * Number(e.effectiveGasPrice || 0)) / 10 ** 18
        return amount
      })
    const gasToken = gasTokenId[chain];
    const prices = (await getPrices([gasToken], toTimestamp));
    const dailyGas = txReceipt.reduce((a: number, b: number) => a + b, 0);
    const gagPrice = prices[gasToken].price
    const dailyGasUsd = dailyGas * gagPrice;
    const totalExFees = (amount_fullfill * gagPrice);
    const dailyFees = (totalExFees)
    const dailyRevenue = dailyFees - dailyGasUsd;

    return {
      dailyFees,
      dailyRevenue,
    }

  }
}


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BAHAMUT]: {
      fetch: fetch(CHAIN.BAHAMUT),
      start: '2024-05-22',
    }
  },
  methodology: {
    Fees: "All Fees generated from activity on Erinaceus VRF Coordinator contract.",
    Revenue: "All Fees generated from activity on Erinaceus VRF Coordinator contract subtract transaction fees.",
  }
}
export default adapter;

