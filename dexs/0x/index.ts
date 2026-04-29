import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { id, zeroPadValue } from "ethers";

// 0x Settler contracts — pass-through swap router
const config: Record<string, string> = {
  [CHAIN.ETHEREUM]:  "0x7f54F05635d15Cde17A49502fEdB9D1803A3Be8A",
  [CHAIN.ARBITRUM]:  "0xfeEA2A79D7d3d36753C8917AF744D71f13C9b02a",
  [CHAIN.AVAX]:      "0x6De411A14aEaafB3f23697A4472a4D4ed275Ac0f",
  [CHAIN.BSC]:       "0xc2eff1F1cE35d395408A34Ad881dBCD978F40b89",
  [CHAIN.BASE]:      "0x7747F8D2a76BD6345Cc29622a946A929647F2359",
  [CHAIN.BERACHAIN]: "0x4D97d7E4230003277FD02AbeaBeE835De389b673",
  [CHAIN.BLAST]:     "0x9dEf2d15F0E6eEddCe5D5E53744AFA48D89d5FFc",
  [CHAIN.XDAI]:      "0xC4709F3d83C716a64A0f77e50b11BE98620b110D",
  [CHAIN.INK]:       "0x51d9175CEE6eAdCD99936C13C5e6d8D172e6158f",
  [CHAIN.LINEA]:     "0x1816eA2150e74Eb3068A4e3809E461Cc6977A7D7",
  [CHAIN.MANTLE]:    "0xe3fBE7889A51d62AcD4E056d756F6eA04a3d8D2d",
  [CHAIN.MODE]:      "0x42118eCae71CffA9D4b56598B21D7B29b2F4D58C",
  [CHAIN.MONAD]:     "0xfb78Fcae443eB423b59B8C186518c5dF94416344",
  [CHAIN.OPTIMISM]:  "0x8CF38ec1BB723e6B948442Dc604b35a54D3Dc893",
  [CHAIN.POLYGON]:   "0x7150ea07D00d8E5a46bcC809f1c9FDf5cb5f8E81",
  [CHAIN.SCROLL]:    "0x06E1DFE03bEaFC30A87b91b9c504926cAf9b8094",
  [CHAIN.SONIC]:     "0x1544b5A855C5D1A0D61e3efaC53b3FBEDb83Ba80",
  [CHAIN.UNICHAIN]:  "0x972655fACb8Df3CdF40395E4262f874f81674D46",
};

const TRANSFER_SIG = id("Transfer(address,address,uint256)");

const fetch = async (options: FetchOptions) => {
  const settler = config[options.chain];
  const dailyVolume = options.createBalances();

  // Fetch all ERC20 Transfer events where from = settler address
  const logs = await options.getLogs({
    topics: [
      TRANSFER_SIG,
      zeroPadValue(settler.toLowerCase(), 32),
      null as any,
    ],
    noTarget: true,
  });

  // Group by tx hash and take only the last outgoing transfer per tx
  // to avoid double-counting intermediate hops
  const grouped: Record<string, any[]> = {};
  for (const log of logs) {
    if (!grouped[log.transactionHash]) grouped[log.transactionHash] = [];
    grouped[log.transactionHash].push(log);
  }

  for (const txLogs of Object.values(grouped)) {
    const last = txLogs[txLogs.length - 1];
    dailyVolume.add(last.address, last.data);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(config).map((chain) => [chain, { fetch, start: "2024-12-01" }])
  ),
};

export default adapter;
