import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';

const reactors = {
  [CHAIN.ARBITRUM]: ["0x6d81571b4c75ccf08bd16032d0ae54dbaff548b0"],
  [CHAIN.BASE]: ["0x3c53c04d633bec3fb0de3492607c239bf92d07f9"],
  [CHAIN.ETHEREUM]: ["0x3C53c04d633bec3fB0De3492607C239BF92d07f9", "0xF08DB8D79312ce610aEED9463EdE1A6BB8aE4235"],
  [CHAIN.OPTIMISM]: ["0xcb23e6c82c900e68d6f761bd5a193a5151a1d6d2", "0x98169248bdf25e0e297ea478ab46ac24058fac78", "0x95b7F3662Ba73b3fF35874Af0E09b050dB03118B"]
}

const fillabi = "event Fill (bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)"

const fetch = async (options: FetchOptions) => {

  const fills = await options.getLogs({
    targets: reactors[options.chain],
    eventAbi: fillabi,
  })

  const fillers = new Set<string>();
  const swappers = new Set<string>();

  fills.forEach((fill) => {
    fillers.add(fill.filler);
    swappers.add(fill.swapper);
  });

  if (fillers.size > 0 && swappers.size > 0) {
    let dailyVolume = await addTokensReceived({
      options,
      targets: Array.from(swappers),
      fromAdddesses: Array.from(fillers),
    });
    
    return { dailyVolume }
  }

  return { dailyVolume: 0}
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch as any,
      start: '2023-09-24'
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: '2024-02-21'
    },
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2024-03-19'
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2023-04-24'
    }
  },
}

export default adapter;
