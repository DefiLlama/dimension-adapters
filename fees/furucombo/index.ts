import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Furucombo runs on Protocolink (https://github.com/dinngo/protocolink-contract).
// Every fee is paid by a user's Agent (or a flash-loan callback) through FeeLibrary, which emits
// Charged(token, amount, collector, metadata). Furucombo's fees go to its default collector.
const CHARGED_EVENT = 'event Charged(address indexed token, uint256 amount, address indexed collector, bytes32 metadata)';
const CHARGED_TOPIC = '0x35a3dffe7c5e557c9379dbe39253faee9171d9ddae8c79c06f9fc5813a083bf5';
const FURUCOMBO_COLLECTOR = '0xFB20753f85f89be6F42D228667D70e62D1Ba5f75';
const COLLECTOR_TOPIC = '0x000000000000000000000000' + FURUCOMBO_COLLECTOR.slice(2).toLowerCase();
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({
    noTarget: true,
    eventAbi: CHARGED_EVENT,
    topics: [CHARGED_TOPIC, null as any, COLLECTOR_TOPIC],
  });
  for (const log of logs) {
    const token = log.token.toLowerCase() === NATIVE ? ADDRESSES.null : log.token;
    dailyFees.add(token, log.amount);
  }
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  methodology: {
    Fees: 'Fees paid by users for using Furucombo services.',
    Revenue: 'All fees are revenue.',
  },
  version: 2,
  pullHourly: true,
  fetch,
  // Protocolink Router v1 (0xDec80E988F4baF43be69c13711453013c212feA8) was deployed on 2023-11-18/19 on every chain;
  // fees before that went through the legacy Furucombo proxies and are kept from the old API backfill.
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-11-18' },
    [CHAIN.POLYGON]: { start: '2023-11-18' },
    [CHAIN.ARBITRUM]: { start: '2023-11-18' },
    [CHAIN.OPTIMISM]: { start: '2023-11-18' },
    [CHAIN.AVAX]: { start: '2023-11-18' },
    [CHAIN.METIS]: { start: '2023-11-18' },
    [CHAIN.BASE]: { start: '2023-11-18' },
    [CHAIN.XDAI]: { start: '2023-11-18' },
  },
};

export default adapter;
