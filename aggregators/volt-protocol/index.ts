import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getCheckpointAtTimestamp, graphqlCall } from "../../helpers/sui";

const VOLT_FEE_RECEIVER = '0x7211d7a33c32b8a848fd5d87dc0630b7d40d3d324856a748aff454c2955cab12';
const CONFIRM_SWAP_EVENT = '0xffd4058af7d6f6d66c335930cced8c91e38ec943e2392232aee27e8127e684e9::router::ConfirmSwapEventV3';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const [{ sequenceNumber: fromCheckpoint }, { sequenceNumber: toCheckpoint }] = await Promise.all([
    getCheckpointAtTimestamp(options.startTimestamp - 1),
    getCheckpointAtTimestamp(options.endTimestamp),
  ]);

  let after: string | null = null;
  while (true) {
    const { transactions }: any = await graphqlCall(`query ($after: String) {
      transactions(first: 50, after: $after, filter: { affectedAddress: "${VOLT_FEE_RECEIVER}", afterCheckpoint: ${fromCheckpoint}, beforeCheckpoint: ${toCheckpoint + 1} }) {
        pageInfo { hasNextPage endCursor }
        nodes { digest sender { address } effects { status timestamp events(first: 50) { pageInfo { hasNextPage } nodes { contents { type { repr } json } } } } }
      }
    }`, { after });

    for (const tx of transactions.nodes) {
      const time = Date.parse(tx.effects.timestamp) / 1e3;
      if (time < options.startTimestamp || time >= options.endTimestamp || tx.effects.status !== 'SUCCESS') continue;
      if (tx.effects.events.pageInfo.hasNextPage) throw new Error(`volt-protocol: more than 50 events in ${tx.digest}`);
      if (tx.sender?.address === VOLT_FEE_RECEIVER) continue;
      for (const { contents } of tx.effects.events.nodes) {
        if (contents.type.repr !== CONFIRM_SWAP_EVENT || contents.json.fee_recipient !== VOLT_FEE_RECEIVER) continue;
        dailyVolume.add(`0x${contents.json.from}`, contents.json.amount_in);
      }
    }

    if (!transactions.pageInfo.hasNextPage) break;
    after = transactions.pageInfo.endCursor;
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-11-01',
  doublecounted: true, // executed by the Cetus aggregator, whose own listing counts these swaps
  methodology: {
    Volume: "Input amount of swaps made on Volt, read from Cetus aggregator swap events that pay Volt's overlay fee.",
  },
};

export default adapter;
