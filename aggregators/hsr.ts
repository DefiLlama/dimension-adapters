import ADDRESSES from '../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { isCoreAsset } from '../helpers/prices';

// HSR swaps routed through KyberSwap on Base, Ethereum, BNB Chain, Optimism and Arbitrum. HSR passes its client id to
// the KyberSwap API on every chain and the router writes it into the ClientData event ({"Source":"hsr",...}), e.g.
// https://basescan.org/tx/0xd064c6e43073c1067303987ab06bb9a19dc725c7d930f0dbfb4dcfda3542cd2a#eventlog

// KyberSwap MetaAggregationRouterV2, event ABIs from the verified source:
// https://github.com/KyberNetwork/ks-dex-aggregation-router-v2-sc/blob/954cba76592896132c54900cc7cf82242615d1bb/src/MetaAggregationRouterV2.sol
// The router has the same address on all five chains:
// https://basescan.org/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code
// https://etherscan.io/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code
// https://bscscan.com/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code
// https://optimistic.etherscan.io/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code
// https://arbiscan.io/address/0x6131B5fae19EA4f9D964eAc0408E4408b66337b5#code
const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
const KYBER_NATIVE = ADDRESSES.GAS_TOKEN_2; // KyberSwap's native ETH placeholder (ETH_ADDRESS in the router source)
const HSR_SOURCE = 'hsr';

const SwappedEvent = 'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)';
const ClientDataEvent = 'event ClientData(bytes clientData)';

// Liquid tokens priced by DefiLlama that are not in coreAssets.json (Base)
const EXTRA_MAJOR_TOKENS: Record<string, Set<string>> = { [CHAIN.BASE]: new Set([
  '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b', // VIRTUAL
  '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42', // EURC
  '0x820c137fa70c8691f0e44dc420a5e53c168921dc', // USDS
  '0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee', // GHO
  '0x2416092f143378750bb29b79ed961ab195cceea5', // ezETH
  '0x236aa50979d5f3de3bd1eeb40e81137f22ab794b', // tBTC
  '0x532f27101965dd16442e59d40670faf5ebb142e4', // BRETT
  '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', // DEGEN
]) };

const isMajor = (chain: string, token: string) => token === KYBER_NATIVE || isCoreAsset(chain, token) || !!EXTRA_MAJOR_TOKENS[chain]?.has(token);

const isHsr = (clientData: string) => {
  try {
    return JSON.parse(Buffer.from(String(clientData).slice(2), 'hex').toString('utf8'))?.Source === HSR_SOURCE;
  } catch {
    return false;
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const clientData = await options.getLogs({ target: KYBER_ROUTER, eventAbi: ClientDataEvent, onlyArgs: false });
  const hsrTags = clientData.filter((log: any) => isHsr(log.args.clientData));
  if (!hsrTags.length) return { dailyVolume };

  const blocks = hsrTags.map((log: any) => Number(log.blockNumber));
  const swapped = await options.getLogs({
    target: KYBER_ROUTER, eventAbi: SwappedEvent, onlyArgs: false,
    fromBlock: Math.min(...blocks), toBlock: Math.max(...blocks),
  });

  const hsrTxs = new Set(hsrTags.map((log: any) => log.transactionHash.toLowerCase()));
  const logsByTx = new Map<string, any[]>();
  for (const log of [...swapped, ...clientData]) {
    const tx = log.transactionHash.toLowerCase();
    if (!hsrTxs.has(tx)) continue;
    if (!logsByTx.has(tx)) logsByTx.set(tx, []);
    logsByTx.get(tx)!.push(log);
  }
  
  for (const [tx, logs] of logsByTx) {
    logs.sort((a, b) => Number(a.logIndex) - Number(b.logIndex));
    let swap: any = null;
    for (const log of logs) {
      if (log.args.spentAmount !== undefined) {
        swap = log.args;
        continue;
      }
      if (isHsr(log.args.clientData)) {
        if (!swap) throw new Error(`hsr: ClientData without a preceding Swapped in ${tx}`);
        const srcToken = swap.srcToken.toLowerCase();
        const dstToken = swap.dstToken.toLowerCase();
        const [token, amount] = isMajor(options.chain, srcToken) ? [srcToken, swap.spentAmount]
          : isMajor(options.chain, dstToken) ? [dstToken, swap.returnAmount] : [null, 0];
        if (token === KYBER_NATIVE) dailyVolume.addGasToken(amount);
        else if (token) dailyVolume.add(token, amount);
      }
      swap = null;
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  doublecounted: true, //KyberSwap
  // Start coverage at HSR network availability; these are not claims of first swaps.
  // Base retains the date of its first historically verified HSR-tagged swap.
  adapter: {
    [CHAIN.BASE]: { start: '2026-10-19' },
    [CHAIN.ETHEREUM]: { start: '2026-10-12' },
    [CHAIN.BSC]: { start: '2026-10-12' },
    [CHAIN.OPTIMISM]: { start: '2026-10-14' },
    [CHAIN.ARBITRUM]: { start: '2026-10-15' },
  },
  methodology: {
    Volume: 'Value of swaps made through HSR and routed through KyberSwap, counted on the major token of each swap. Swaps between two long-tail tokens are excluded.',
  },
};

export default adapter;
