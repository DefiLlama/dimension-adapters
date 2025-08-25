const SUBGRAPH = "https://api.haven1.0xgraph.xyz/api/public/bc373e5f-de53-4599-8572-61e112a16f4a/subgraphs/uniswap-v3/main-v0.0.4/";

async function gql(query, variables) {
  const res = await fetch(SUBGRAPH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || res.status));
  return json.data;
}

function dayStart(ts) {
  return Math.floor(ts / 86400) * 86400;
}

const adapter = {
  adapter: {
    Haven1: {
      fetch: async (timestamp) => {
        const date = dayStart(timestamp);
        const data = await gql(
          `query($d:Int!){ poolDayDatas(where: { date: $d }, first: 1000){ feesUSD } }`,
          { d: date }
        );
        const fees = (data.poolDayDatas || []).map((d) => Number(d.feesUSD)).filter(Number.isFinite);
        const sum = fees.reduce((a, b) => a + b, 0);
        return {
          dailyFees: sum.toString(),
          dailyRevenue: "0",
          dailySupplySideRevenue: sum.toString(),
        };
      },
      start: async () => {
        const d = await gql(`query{ poolDayDatas(orderBy: date, orderDirection: asc, first: 1){ date } }`);
        return Number(d.poolDayDatas?.[0]?.date || 0);
      },
    },
  },
  protocolType: 'fees',
};

module.exports = { default: adapter };


