import { ChainBlocks } from "@defillama/adapters/volumes/dexVolume.type";
import sdk from "@defillama/sdk"
import retry from "async-retry"
import axios from "axios"
import { providers } from "@defillama/sdk/build/general"
import type { Chain } from "@defillama/sdk/build/general"

async function getBlock(timestamp: number, chain: Chain, chainBlocks: ChainBlocks, undefinedOk: boolean = false) {
  if (
    chainBlocks?.[chain] !== undefined ||
    (process.env.HISTORICAL === undefined && undefinedOk)
  ) {
    return chainBlocks[chain];
  } else {
    if (chain === "celo") {
      return Number(
        (
          await retry(
            async () =>
              await axios.get(
                "https://explorer.celo.org/api?module=block&action=getblocknobytime&timestamp=" +
                timestamp +
                "&closest=before"
              )
          )
        ).data.result.blockNumber
      );
    }
    return sdk.api.util
      .lookupBlock(timestamp, { chain })
      .then((blockData) => blockData.block);
  }
}

const canGetBlock = (chain: string) => Object.keys(providers).includes(chain)

export {
  getBlock,
  canGetBlock
}