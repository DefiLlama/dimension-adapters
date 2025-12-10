
import { queryFlipside } from "./helpers/flipsidecrypto";

(async () => {
  try {
    console.log("Querying Flipside...");
    // Attempt to select from expected table
    const data = await queryFlipside("SELECT * FROM stacks.core.fact_transactions LIMIT 1");
    console.log("Data:");
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error:");
    console.error(e);
  }
})();
