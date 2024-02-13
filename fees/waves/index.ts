import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const limitPerRequest = 99;
const blockHeadersEndpoint = "https://nodes.wavesnodes.com/blocks/headers/seq";

interface IBlockHeader {
  totalFee: number,
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getFromBlock, getToBlock }: FetchOptions) => {
  const dailyFees = createBalances()

  let startBlock = await getFromBlock();
  let endBlock = await getToBlock();
  const wavesToken = "WAVES";

  let blockHeaders: IBlockHeader[] = [];
  while (startBlock < endBlock) {
    if (startBlock + limitPerRequest <= endBlock) {
      blockHeaders = blockHeaders.concat((await fetchURL(`${blockHeadersEndpoint}/${startBlock}/${startBlock + limitPerRequest}`)));
      startBlock += limitPerRequest;
    } else {
      blockHeaders = blockHeaders.concat((await fetchURL(`${blockHeadersEndpoint}/${startBlock}/${endBlock}`)));
      break;
    }
  }

  dailyFees.add(wavesToken, blockHeaders.reduce((acc, header) => acc + header.totalFee, 0))

  return { timestamp, dailyFees, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.WAVES]: {
      fetch,
      start: 1623024000
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
