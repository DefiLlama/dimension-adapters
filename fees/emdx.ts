import { Adapter } from "../adapters/types";
import { AVAX } from "../helpers/chains";
import axios from "axios";

const endpoint = "https://app-api.dune.com/v1/graphql";

const getFees = async () => {
  const response = await axios.post(endpoint,
    {
      operationName: "GetExecution",
      variables: {
        execution_id: "01GJ5TYJK5ET1PP99QQSTNS4Q4",
        parameters: [],
        query_id: 1631290,
      },
      query: "query\":\"query GetExecution($execution_id: String!, $query_id: Int!, $parameters: [Parameter!]!) {\\n  get_execution(\\n    execution_id: $execution_id\\n    query_id: $query_id\\n    parameters: $parameters\\n  ) {\\n    execution_queued {\\n      execution_id\\n      execution_user_id\\n      position\\n      execution_type\\n      created_at\\n      __typename\\n    }\\n    execution_running {\\n      execution_id\\n      execution_user_id\\n      execution_type\\n      started_at\\n      created_at\\n      __typename\\n    }\\n    execution_succeeded {\\n      execution_id\\n      runtime_seconds\\n      generated_at\\n      columns\\n      data\\n      __typename\\n    }\\n    execution_failed {\\n      execution_id\\n      type\\n      message\\n      metadata {\\n        line\\n        column\\n        hint\\n        __typename\\n      }\\n      runtime_seconds\\n      generated_at\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\"}"
    }
  );

  return response.data.data.get_execution.execution_succeeded?.data[0];
}

const fetch = async (timestamp: number) => {
  const fees = await getFees();

  return {
    timestamp,
    totalFees: fees?.cumulative_fees || 0,
    dailyFees: fees?.volume || 0,
    totalRevenue: '0',
    dailyRevenue: '0',
  };
};


const adapter: Adapter = {
  adapter: {
    [AVAX]: {
      fetch: fetch,
      start: async () => 1653048000
    },
  }
}

export default adapter;
