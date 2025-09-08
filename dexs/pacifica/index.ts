import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

export default {
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  version: 2,
  fetch: async () => {
    const { data } = await httpGet('https://api.pacifica.fi/api/v1/info/prices')
    const volume = data.reduce((a: number, b: { volume_24h: string }) => a + Number(b.volume_24h), 0)
    const oi = data.reduce((a: number, b: { open_interest	: string }) => a + Number(b.open_interest	), 0)
    return {
      dailyVolume: volume,
      openInterestAtEnd: oi,
    };
  }

}