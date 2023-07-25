import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";

async function getFees(toTimestamp:number, fromTimestamp:number, chainBlocks: ChainBlocks){
  const todaysBlock = (await getBlock(toTimestamp, CHAIN.BASE, chainBlocks));
  const yesterdaysBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));


  const feeWallet = '0x4200000000000000000000000000000000000011';
  const l1FeeVault = '0x420000000000000000000000000000000000001a';
  const baseFeeVault = '0x4200000000000000000000000000000000000019';

  const [
      feeWalletStart,
      feeWalletEnd,
      l1FeeVaultStart,
      l1FeeVaultEnd,
      baseFeeVaultStart,
      baseFeeVaultEend
  ] = await Promise.all([
      getBalance({
          target: feeWallet,
          block: yesterdaysBlock,
          chain: CHAIN.BASE
      }),
      getBalance({
          target: feeWallet,
          block: todaysBlock,
          chain: CHAIN.BASE
      }),
      getBalance({
          target: l1FeeVault,
          block: yesterdaysBlock,
          chain: CHAIN.BASE
      }),
      getBalance({
          target: l1FeeVault,
          block: todaysBlock,
          chain: CHAIN.BASE
      }),
      getBalance({
          target: baseFeeVault,
          block: yesterdaysBlock,
          chain: CHAIN.BASE
      }),
      getBalance({
          target: baseFeeVault,
          block: todaysBlock,
          chain: CHAIN.BASE
      })
  ])
  const ethBalance = (new BigNumber(feeWalletEnd.output).minus(feeWalletStart.output))
      .plus((new BigNumber(l1FeeVaultEnd.output).minus(l1FeeVaultStart.output)))
      .plus((new BigNumber(baseFeeVaultEend.output).minus(baseFeeVaultStart.output)))

  return (ethBalance.plus(0)).div(1e18)
}

const fetch = async (timestamp: number, chainBlocks: ChainBlocks) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fees = await getFees(toTimestamp, fromTimestamp, chainBlocks);;
  return {
    timestamp,
    dailyFees: `${fees}`
  }
}

const adapter: Adapter = {
  adapter: {
      [CHAIN.BASE]: {
          fetch: fetch,
          start: async () => 1598671449,
      },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
