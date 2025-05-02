import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FACTORIES = [
  '0x9f383e31aA37b6a4F0F57033558C54c37B5De45F',
  '0xE0C0Cb05b6dFe6C7d196493963Bf083E726fc517',
  '0xde11a16D6e04551168dfD54e936829B024A236C4',
  '0xFC01f2D61dF1a4E991e6b53BDB54bEc49b1bDB01',
  '0x0a063c664E0Cd6a6Ae5741F15EA74c80D6155f9B',
  '0x907657a432931265E0eeb4B661a19311F96Aba8E',
  '0x4274f80635183e9bE3c16E1313a16f929B61E00e',
];

const FEE = BigInt(100);

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: (async (options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const logs = await options.getLogs({
          targets: FACTORIES,
          eventAbi: "event BellumSwap(address indexed token, address indexed sender, uint amount0In, uint amount0Out, uint amount1In, uint amount1Out)",
        })
        logs.map((tx: any) => {
          dailyFees.addGasToken((tx.amount1In + tx.amount1Out) / FEE)
        })
        return { dailyFees, dailyRevenue: dailyFees }
      }) as any,
      start: '2024-08-11'
    },
  },

}

export default adapter;
