import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, FetchResultFees, ProtocolType } from "../adapters/types";
import postgres from "postgres";
import { getPrices } from "../utils/prices";

// https://etherscan.io/address/0x30c789674ad3b458886bbc9abf42eee19ea05c1d
async function getFees(toTimestamp:number, fromTimestamp:number, chainBlocks: ChainBlocks){
  const todaysBlock = (await getBlock(toTimestamp, CHAIN.MANTA, chainBlocks));
  const yesterdaysBlock = (await getBlock(fromTimestamp, CHAIN.MANTA, {}));

  const feeWallet = '0x4200000000000000000000000000000000000011';
  const l1FeeVault = '0x420000000000000000000000000000000000001a';
  const [
      feeWalletStart,
      feeWalletEnd,
      l1FeeVaultStart,
      l1FeeVaultEnd,
  ] = (await Promise.all([
      getBalance({
          target: feeWallet,
          block: yesterdaysBlock,
          chain: CHAIN.MANTA
      }),
      getBalance({
          target: feeWallet,
          block: todaysBlock,
          chain: CHAIN.MANTA
      }),
      getBalance({
        target: l1FeeVault,
        block: yesterdaysBlock,
        chain: CHAIN.MANTA
      }),
      getBalance({
          target: l1FeeVault,
          block: todaysBlock,
          chain: CHAIN.MANTA
      })
  ])).map(i => i.output)
  const ethBalance = (new BigNumber(feeWalletEnd).minus(feeWalletStart))
    .plus(new BigNumber(l1FeeVaultEnd).minus(l1FeeVaultStart));
  return ethBalance.div(1e18)
}

const fetch = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const sql = postgres(process.env.INDEXA_DB!);
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  try {

        const dailyFees = await getFees(toTimestamp, fromTimestamp, chainBlocks);
        const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
        const pricesObj: any = await getPrices([ethAddress], toTimestamp);
        const latestPrice = pricesObj[ethAddress]["price"]
        const dailyFeesUSD = dailyFees.times(latestPrice)

        await sql.end({ timeout: 3 })
        return {
            timestamp,
            dailyFees: `${dailyFeesUSD.toString()}`,
            dailyRevenue: '0',
        }
    } catch(error) {
        await sql.end({ timeout: 3 })
        console.error(error);
        throw error;
    }
}

const adapter: Adapter = {
  adapter: {
      [CHAIN.MANTA]: {
          fetch: fetch,
          start: async () => 1687474800,
      },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
