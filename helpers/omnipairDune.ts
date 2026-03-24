import { FetchOptions } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";

type OmnipairDuneRow = {
  block_date: string;
  token_in_mint: string;
  daily_volume: string | number;
  daily_fees: string | number;
  daily_revenue: string | number;
  daily_protocol_revenue: string | number;
  daily_supply_side_revenue: string | number;
};

function normalizeValue(value: string | number | null | undefined): string {
  if (value == null) return "0";
  return typeof value === "string" ? value : String(value);
}

export async function fetchOmnipairDuneDaily(options: FetchOptions): Promise<OmnipairDuneRow[]> {
  if (!process.env.DUNE_API_KEYS) return [];

  const sql = `
    select
      cast(block_date as varchar) as block_date,
      token_in_mint,
      cast(daily_volume as varchar) as daily_volume,
      cast(daily_fees as varchar) as daily_fees,
      cast(daily_revenue as varchar) as daily_revenue,
      cast(daily_protocol_revenue as varchar) as daily_protocol_revenue,
      cast(daily_supply_side_revenue as varchar) as daily_supply_side_revenue
    from query_6897800
    where block_date >= cast(from_unixtime(${options.startTimestamp}) as date)
      and block_date < cast(from_unixtime(${options.endTimestamp}) as date)
    order by 1 desc, 2
  `;

  const rows = await queryDuneSql(options, sql);

  return (rows ?? []).map((row: any) => ({
    block_date: row.block_date,
    token_in_mint: row.token_in_mint,
    daily_volume: normalizeValue(row.daily_volume),
    daily_fees: normalizeValue(row.daily_fees),
    daily_revenue: normalizeValue(row.daily_revenue),
    daily_protocol_revenue: normalizeValue(row.daily_protocol_revenue),
    daily_supply_side_revenue: normalizeValue(row.daily_supply_side_revenue),
  }));
}