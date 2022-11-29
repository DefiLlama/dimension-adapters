import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

// event DevGovFeeCharged(uint valueDai); 0x94bf664d3924a5d5d3e71ee53c5bdcce866ec4b43c54db2cd179f3473790920d
// event ReferralFeeCharged(uint valueDai); 0x146e3fd3726924a61f7680adc15e73436f5e17a023460d5fc860dd9abce05c8f
// event NftBotFeeCharged(uint valueDai); 0x14f8be3132e5b96272e03b3f1bf63723d335360268f02c28c75808359d70490b
// event SssFeeCharged(uint valueDai); 0x3788d58fa410ec2544131c6c383109bca0ba17fb72096a3f77581aba0e454228
// event DaiVaultFeeCharged(uint valueDai); 0x5d2a90b1b3edfd2a9bea268b669e9d44c0a8d46b9f593cdd25ed986aefa2ae99
// event LpFeeCharged(uint valueDai); 0xc476668ed4772e5ad97cf622f4fa0e63e9671e7d9e169ee746432fdb21bc42b2
const FEE_ADDRESS = "0x6805dD635AA542210ed572F7b93121002c629690";
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const todaysBlock = (await getBlock(todaysTimestamp, "polygon", {}));
  const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, "polygon", {}));
  const logs = await sdk.api.util.getLogs({
    target: FEE_ADDRESS,
    topic: "LpFeeCharged(uint valueDai)",
    toBlock: yesterdaysBlock,
    fromBlock: todaysBlock,
    keys: [],
    chain: "polygon",
    topics: ["0xc476668ed4772e5ad97cf622f4fa0e63e9671e7d9e169ee746432fdb21bc42b2"]
  });
  console.log(logs.output)
  return {
    timestamp
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
        fetch: fetch,
        start: async ()  => 1630468800,
    },
  }
}

export default adapter;
