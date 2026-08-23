import request, { gql } from "graphql-request";

export const SARCOPHAGUS_HOLDERS_REVENUE_LABEL = "Fees funded to Sarcophagus";

type SarcophagusPoolType = "CL" | "LEGACY" | "DLMM";

const pageSize = 1000;
const query = gql`
  query sarcophagusFunding(
    $chainId: Int!
    $poolType: String!
    $from: String!
    $to: String!
    $limit: Int!
    $offset: Int!
  ) {
    SarcophagusFunding(
      limit: $limit
      offset: $offset
      where: {
        chainId: { _eq: $chainId }
        poolType: { _eq: $poolType }
        timestamp: { _gte: $from, _lt: $to }
      }
      order_by: { id: asc }
    ) {
      amountUSD
    }
  }
`;

export async function fetchSarcophagusFundingUSD({
  endpoint,
  chainId,
  poolType,
  startTimestamp,
  endTimestamp,
}: {
  endpoint: string;
  chainId: number;
  poolType: SarcophagusPoolType;
  startTimestamp: number;
  endTimestamp: number;
}) {
  let offset = 0;
  let total = 0;

  while (true) {
    const data = await request<{ SarcophagusFunding: { amountUSD: string }[] }>(endpoint, query, {
      chainId,
      poolType,
      from: String(startTimestamp),
      to: String(endTimestamp),
      limit: pageSize,
      offset,
    });
    const rows = data.SarcophagusFunding;

    for (const row of rows) {
      const amountUSD = Number(row.amountUSD);
      if (!Number.isFinite(amountUSD)) {
        throw new Error(`Invalid SarcophagusFunding amountUSD: ${row.amountUSD}`);
      }
      total += amountUSD;
    }

    if (rows.length < pageSize) return total;
    offset += pageSize;
  }
}
