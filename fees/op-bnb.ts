import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, FetchResultFees, ProtocolType } from "../adapters/types";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";

async function getFees(toTimestamp:number, fromTimestamp:number, chainBlocks: ChainBlocks){
  const todaysBlock = (await getBlock(toTimestamp,CHAIN.OP_BNB, chainBlocks));
  const yesterdaysBlock = (await getBlock(fromTimestamp,CHAIN.OP_BNB, {}));

  const feeWallet = '0x4200000000000000000000000000000000000011';
  const l1FeeVault = '0x420000000000000000000000000000000000001a';

  const [
      feeWalletStart,
      feeWalletEnd,
      l1FeeVaultStart,
      l1FeeVaultEnd,
  ] = await Promise.all([
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
  ])
  const ethBalance = (new BigNumber(feeWalletEnd.output).minus(feeWalletStart.output))
      .plus((new BigNumber(l1FeeVaultEnd.output).minus(l1FeeVaultStart.output)))

  return (ethBalance.plus(0)).div(1e18)
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

      const value: number[] = (await queryFlipside(query)).flat();
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
