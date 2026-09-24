import { getAddress, id, zeroPadValue } from "ethers";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const contracts: Record<string, string[]> = {
  [CHAIN.CRONOS]: [
    getAddress("0xeb02A792A9a85c00498A72b13B9aA5c486bC6cA1"),
    getAddress("0x1189331089b6ca8beA989C1F2fFd0EfAdCd33a69"),
    getAddress("0x505dC8145B878B3B04c2f6cB3E88716dF27208C2"),
  ],
  [CHAIN.CRONOS_ZKEVM]: [
    getAddress("0xDb0837D207708F55549a425638de3E2f53Eea141"),
    getAddress("0x6c40b752be1cAa3695D0e9a2Ef54Cd295c3e89dd"),
  ],
};

// uniV2 Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
// data words: [amount0In, amount1In, amount0Out, amount1Out]
const SWAP_TOPIC = id("Swap(address,uint256,uint256,uint256,uint256,address)");

const fetch = async ({ createBalances, getLogs, chain, api }: FetchOptions) => {
  const routerAddresses = contracts[chain].map((addr) => addr.toLowerCase());
  const dailyVolume = createBalances();

  const allLogs = await Promise.all(
    routerAddresses.map((routerAddress) =>
      getLogs({
        topics: [SWAP_TOPIC, null as any, zeroPadValue(routerAddress, 32)],
        noTarget: true,
        entireLog: true,
      })
    )
  );
  const logs = allLogs.flat();
  if (!logs.length) return { dailyVolume };

  // A routed trade emits one Swap per hop, each with `to` = router. Counting every hop
  // double counts multi-hop routes, and the previous implementation attributed every hop's
  // output to the final destination token, which blew intermediate-token amounts up into
  // absurd USD values. Keep only the last hop of each tx and price it in the pair's own token.
  const lastHopByTx: Record<string, any> = {};
  for (const log of logs) {
    const txHash = log.transactionHash.toLowerCase();
    const current = lastHopByTx[txHash];
    if (!current || Number(log.logIndex ?? log.index) > Number(current.logIndex ?? current.index)) lastHopByTx[txHash] = log;
  }
  const hops = Object.values(lastHopByTx);

  const pairs = [...new Set(hops.map((log: any) => log.address.toLowerCase()))];
  const [token0s, token1s] = await Promise.all([
    api.multiCall({ abi: 'address:token0', calls: pairs, permitFailure: true }),
    api.multiCall({ abi: 'address:token1', calls: pairs, permitFailure: true }),
  ]);
  const pairTokens: Record<string, [string, string]> = {};
  pairs.forEach((pair, i) => {
    if (token0s[i] && token1s[i]) pairTokens[pair] = [token0s[i], token1s[i]];
  });

  for (const log of hops) {
    const tokens = pairTokens[log.address.toLowerCase()];
    if (!tokens) continue;
    const data = log.data.slice(2);
    if (data.length < 64 * 4) continue;
    const amount0Out = BigInt("0x" + data.slice(64 * 2, 64 * 3));
    const amount1Out = BigInt("0x" + data.slice(64 * 3, 64 * 4));
    if (amount0Out > 0n) dailyVolume.add(tokens[0], amount0Out.toString());
    if (amount1Out > 0n) dailyVolume.add(tokens[1], amount1Out.toString());
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.keys(contracts).reduce((acc, chain) => {
    acc[chain] = {
      fetch,
      start: "2024-07-25",
    };
    return acc;
  }, {} as BaseAdapter),
};

export default adapter;
