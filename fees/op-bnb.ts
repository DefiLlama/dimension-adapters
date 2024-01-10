import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, FetchResultFees, ProtocolType } from "../adapters/types";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";
import * as sdk from "@defillama/sdk";
const retry = require("async-retry")

const topic0 = '0xc8a211cc64b6ed1b50595a9fcb1932b6d1e5a6e8ef15b60e5b1f988ea9086bba';
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

async function getFees(toTimestamp:number, fromTimestamp:number, chainBlocks: ChainBlocks){
  const todaysBlock1 = (await getBlock(toTimestamp,CHAIN.OP_BNB, {}));
  const todaysBlock = (await getBlock(toTimestamp,CHAIN.OP_BNB, chainBlocks));
  const yesterdaysBlock = (await getBlock(fromTimestamp,CHAIN.OP_BNB, {}));
  const feeWallet = '0x4200000000000000000000000000000000000011';
  const l1FeeVault = '0x420000000000000000000000000000000000001a';
  const logsWithdrawal: ILog[] = (await Promise.all([feeWallet, l1FeeVault].map(address => sdk.getEventLogs({
    toBlock: todaysBlock1,
    fromBlock: yesterdaysBlock,
    target: address,
    topics: [topic0],
    chain: CHAIN.OP_BNB,
  })))).flat();
  const withdrawAmount = logsWithdrawal.map((log: ILog) => {
    const parsedLog = log.data.replace('0x', '')
    const amount = Number('0x' + parsedLog.slice(0, 64));
    return amount;
  }).reduce((a: number, b: number) => a + b, 0);

  return await retry(async () => {
    try {

      const [feeWalletStart, feeWalletEnd, l1FeeVaultStart, l1FeeVaultEnd] = (await Promise.all([
        getBalance({
          target: feeWallet,
          block: yesterdaysBlock,
          chain:CHAIN.OP_BNB
        }),
        getBalance({
          target: feeWallet,
          block: todaysBlock,
          chain:CHAIN.OP_BNB
        }),
        getBalance({
          target: l1FeeVault,
          block: yesterdaysBlock,
          chain:CHAIN.OP_BNB
        }),
        getBalance({
          target: l1FeeVault,
          block: todaysBlock,
          chain:CHAIN.OP_BNB
        })
      ])).map(i => i.output);

      const ethBalance = (new BigNumber(feeWalletEnd).minus(feeWalletStart))
          .plus((new BigNumber(l1FeeVaultEnd).minus(l1FeeVaultStart)))

      return (ethBalance.plus(withdrawAmount)).div(1e18)
    } catch (e) {
      throw e;
    }
  }, { retries: 5, minTimeout: 1000 * 60 * 5  });
}

const fetch = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
      const [totalFees] = await Promise.all([
          getFees(toTimestamp, fromTimestamp, chainBlocks),
      ]);
      const endblock = (await getBlock(toTimestamp,CHAIN.BSC, chainBlocks));
      const startblock = (await getBlock(fromTimestamp,CHAIN.BSC, {}));
      const query = `
          select
            SUM(TX_FEE)
          from
            bsc.core.fact_transactions
          WHERE (to_address = '0x153cab79f4767e2ff862c94aa49573294b13d169')
          and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
        `

      const value: number[] = (await queryFlipside(query, 260)).flat();
      const cost_to_l1 = value[0]
      const bnbAddress = "bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
      const pricesObj: any = await getPrices([bnbAddress], toTimestamp);
      const latestPrice = pricesObj[bnbAddress]["price"]
      const finalDailyFee = totalFees.times(latestPrice)
      const cost_to_l1_usd =  cost_to_l1 * latestPrice
      const dailyRevenue = finalDailyFee.minus(cost_to_l1_usd);
      return {
        timestamp,
        dailyFees: `${finalDailyFee}`,
        dailyRevenue: `${dailyRevenue}`
      }
    } catch(error) {
      console.error(error);
      throw error;
    }
}

const adapter: Adapter = {
  adapter: {
      [CHAIN.OP_BNB]: {
          fetch: fetch,
          start: async () => 1691971200,
      },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
