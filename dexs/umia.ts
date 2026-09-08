import { ventureVolume } from "../helpers/umia";

// Listing 8513, Umia · UMIA: venture 7, Umia's own. Its spot pool went live at
// migration on 2026-09-02; start sits a day earlier because hourly pulls only
// run from one full day after start.
export default ventureVolume(7, "2026-09-01");
