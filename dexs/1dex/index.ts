import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const endpoint = "https://eos.hyperion.eosrio.io/v2";

interface ActionData {
  account_action_seq: number;
  act: {
    name: string;
    data: {
      quantity?: string;
      contract?: string;
      ev?: {
        price: number;
        base_quantity: string;
        quote_quantity: string;
        time: string;
        [key: string]: any;
      };
      [key: string]: any;
    };
  };
  block_time: string;
  [key: string]: any;
}

interface HyperionResponse {
  actions: ActionData[];
  total: number;
}
async function getContractActions(
  contract: string,
  actionNames: string | string[],
  startDate: string,
  endDate: string
): Promise<ActionData[]> {
  const allActions: ActionData[] = [];
  let skip = 0;
  const limit = 100;
  let hasMore = true;

  const actionNameParam = Array.isArray(actionNames)
    ? actionNames.map((action) => `${contract}:${action}`).join(",")
    : `${contract}:${actionNames}`;

  while (hasMore) {
    const url = `${endpoint}/history/get_actions?account=${contract}&limit=${limit}&skip=${skip}&after=${startDate}&before=${endDate}&filter=${actionNameParam}`;
    const response: HyperionResponse = await httpGet(url);

    const actions = response.actions || [];
    if (actions.length === 0) break;

    allActions.push(...actions);

    skip += limit;
    hasMore = actions.length === limit;
  }

  return allActions;
}

function parseQuantity(quantityStr: string): number {
  const [amount] = quantityStr.split(" ");
  return parseFloat(amount);
}

function formatDate(date: Date): string {
  return date.toISOString();
}

async function fetch() {
  const now = new Date();
  const oneDayAgo = new Date(now);
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const startDate = formatDate(oneDayAgo);
  const endDate = formatDate(now);

  const actions = await getContractActions(
    "event.velox",
    "emitfilled",
    startDate,
    endDate
  );

  let dailyVolume = 0;

  actions.forEach((action) => {
    const eventData = action.act.data.ev;
    if (!eventData) return;

    const quoteAmount = parseQuantity(eventData.quote_quantity);
    dailyVolume += quoteAmount;
  });

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: "2025-04-15",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
