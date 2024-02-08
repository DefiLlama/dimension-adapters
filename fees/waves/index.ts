import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { secondsInDay } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";

const wavesDivider = 1e8;
const limitPerRequest = 99;
const millisecondsInSecond = 1000;
const blockHeadersEndpoint = "https://nodes.wavesnodes.com/blocks/headers/seq";

interface IBlockHeader {
  totalFee: number,
}

const fetch = async (timestamp: number) => {
  const fromTimestamp = (timestamp - secondsInDay) * millisecondsInSecond;
  const toTimestamp = timestamp * millisecondsInSecond;

  let startBlock = (await getBlock(fromTimestamp, CHAIN.WAVES, {}));
  const endBlock = (await getBlock(toTimestamp, CHAIN.WAVES, {}));
  const wavesToken = "waves:WAVES";
  const price = (await getPrices([wavesToken], timestamp))[wavesToken]?.price;

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

  const dailyFees = blockHeaders.reduce((acc, header) => acc + header.totalFee, 0) / wavesDivider * price;

  return {
    timestamp,
    dailyFees: dailyFees.toString(),
  };
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
