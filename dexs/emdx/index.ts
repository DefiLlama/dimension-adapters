import { Adapter } from "../../adapters/types";
import { AVAX } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";

const endpoint = "https://app-api.dune.com/v1/graphql";

const getVolumes = async () => {
  const response = await axios.post(endpoint,
    {
      operationName: "GetExecution",
      variables: {
        execution_id: "01GJ5NXD3HKRYTAHWB16PKG8HJ",
        query_id: 1196507, 
        parameters: []
      },
      query: "query GetExecution($execution_id: String!, $query_id: Int!, $parameters: [Parameter!]!) {\\n  get_execution(\\n    execution_id: $execution_id\\n    query_id: $query_id\\n    parameters: $parameters\\n  ) {\\n    execution_queued {\\n      execution_id\\n      execution_user_id\\n      position\\n      execution_type\\n      created_at\\n      __typename\\n    }\\n    execution_running {\\n      execution_id\\n      execution_user_id\\n      execution_type\\n      started_at\\n      created_at\\n      __typename\\n    }\\n    execution_succeeded {\\n      execution_id\\n      runtime_seconds\\n      generated_at\\n      columns\\n      data\\n      __typename\\n    }\\n    execution_failed {\\n      execution_id\\n      type\\n      message\\n      metadata {\\n        line\\n        column\\n        hint\\n        __typename\\n      }\\n      runtime_seconds\\n      generated_at\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\"}",
    }
  );

  return response.data.data.get_execution.execution_succeeded?.data.pop()
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const volume = await getVolumes();

  return {
    timestamp: dayTimestamp,
    dailyVolume: volume?.volume || 0,
    totalVolume: volume?.cumulative_volume || 0,
  };
}

const adapter: Adapter = {
  adapter: {
    [AVAX]: {
      fetch: fetch,
      start: async () => 1653048000
    },
  }
}

export default adapter;
