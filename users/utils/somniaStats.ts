import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SERIES = {
  txcount: "Transactions per day, last 90 days",
  usercount: "Active addresses per day, last 90 days",
  newusers: "New addresses per day, last 90 days",
};

// explorer.somnia.network dropped the Blockscout stats service; its /charts page embeds the last 90 UTC days of each series
async function fetchDay(start: number) {
  const html: string = (await httpGet("https://explorer.somnia.network/charts")).replace(/\\"/g, '"');
  const date = new Date(start * 1e3);
  const label = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  if (Date.now() - start * 1e3 > 91 * 86400e3) throw new Error(`Somnia explorer charts only cover the last 90 days`);

  const getValue = (ariaLabel: string) => {
    const match = html.match(new RegExp(`"data":\\[([^\\]]*)\\],"height":\\d+,"format":"\\w+","ariaLabel":"${ariaLabel}"`));
    if (!match) throw new Error(`Somnia explorer chart "${ariaLabel}" not found`);
    const entry = JSON.parse(`[${match[1]}]`).find((item: any) => item.label === label);
    if (!entry) throw new Error(`No Somnia explorer "${ariaLabel}" data for ${label}`);
    return Number(entry.value);
  };

  return {
    txcount: getValue(SERIES.txcount),
    usercount: getValue(SERIES.usercount),
    newusers: getValue(SERIES.newusers),
  };
}

export const somniaStatsExports = [{
  name: "somnia",
  id: "somnia",
  chain: CHAIN.SOMNIA,
  type: "chain",
  start: "2025-07-01",
  getUsers: async (start: number, _end: number) => {
    const { usercount, txcount } = await fetchDay(start);
    return [{ usercount, txcount }];
  },
  getNewUsers: async (start: number, _end: number) => {
    const { newusers } = await fetchDay(start);
    return [{ usercount: newusers }];
  },
}];
