import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { id, zeroPadValue } from "ethers";

const config: Record<string, { settler: string; start: string }> = {
  [CHAIN.ETHEREUM]:  { settler: "0x7f54F05635d15Cde17A49502fEdB9D1803A3Be8A", start: "2024-12-01" },
  [CHAIN.ARBITRUM]:  { settler: "0xfeEA2A79D7d3d36753C8917AF744D71f13C9b02a", start: "2024-12-01" },
  [CHAIN.AVAX]:      { settler: "0x6De411A14aEaafB3f23697A4472a4D4ed275Ac0f", start: "2024-12-01" },
  [CHAIN.BSC]:       { settler: "0xc2eff1F1cE35d395408A34Ad881dBCD978F40b89", start: "2024-12-01" },
  [CHAIN.BASE]:      { settler: "0x7747F8D2a76BD6345Cc29622a946A929647F2359", start: "2024-12-01" },
  [CHAIN.BERACHAIN]: { settler: "0x4D97d7E4230003277FD02AbeaBeE835De389b673", start: "2025-02-01" },
  [CHAIN.BLAST]:     { settler: "0x9dEf2d15F0E6eEddCe5D5E53744AFA48D89d5FFc", start: "2024-12-01" },
  [CHAIN.XDAI]:      { settler: "0xC4709F3d83C716a64A0f77e50b11BE98620b110D", start: "2024-12-01" },
  [CHAIN.INK]:       { settler: "0x51d9175CEE6eAdCD99936C13C5e6d8D172e6158f", start: "2025-01-01" },
  [CHAIN.LINEA]:     { settler: "0x1816eA2150e74Eb3068A4e3809E461Cc6977A7D7", start: "2024-12-01" },
  [CHAIN.MANTLE]:    { settler: "0xe3fBE7889A51d62AcD4E056d756F6eA04a3d8D2d", start: "2024-12-01" },
  [CHAIN.MODE]:      { settler: "0x42118eCae71CffA9D4b56598B21D7B29b2F4D58C", start: "2024-12-01" },
  [CHAIN.MONAD]:     { settler: "0xfb78Fcae443eB423b59B8C186518c5dF94416344", start: "2025-04-01" },
  [CHAIN.OPTIMISM]:  { settler: "0x8CF38ec1BB723e6B948442Dc604b35a54D3Dc893", start: "2024-12-01" },
  [CHAIN.POLYGON]:   { settler: "0x7150ea07D00d8E5a46bcC809f1c9FDf5cb5f8E81", start: "2024-12-01" },
  [CHAIN.SCROLL]:    { settler: "0x06E1DFE03bEaFC30A87b91b9c504926cAf9b8094", start: "2024-12-01" },
  [CHAIN.SONIC]:     { settler: "0x1544b5A855C5D1A0D61e3efaC53b3FBEDb83Ba80", start: "2025-01-01" },
  [CHAIN.UNICHAIN]:  { settler: "0x972655fACb8Df3CdF40395E4262f874f81674D46", start: "2025-02-01" },
};

const TRANSFER_SIG = id("Transfer(address,address,uint256)");

const fetch = async (options: FetchOptions) => {
  const { settler } = config[options.chain];
  const dailyVolume = options.createBalances();

  try {
    const logs = await options.getLogs({
      topics: [
        TRANSFER_SIG,
        zeroPadValue(settler.toLowerCase(), 32),
        null as any,
      ],
      noTarget: true,
    });

    // Track the log with the highest logIndex per transaction
    // to correctly identify the final outgoing transfer
    const lastByTx: Record<string, any> = {};
    for (const log of logs) {
      const idx = log.logIndex ?? (log as any).index ?? 0;
      const prev = lastByTx[log.transactionHash];
      if (!prev || idx > (prev.logIndex ?? (prev as any).index ?? 0)) {
        lastByTx[log.transactionHash] = log;
      }
    }

    for (const log of Object.values(lastByTx)) {
      dailyVolume.add(log.address, log.data);
    }
  } catch (e) {
    console.error(`0x Settler log fetch failed on ${options.chain}`, e);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  pullHourly: true,
  version: 2,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
};

export default adapter;
