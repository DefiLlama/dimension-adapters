import { ventureVolume } from "../helpers/umia";

// Venture 7 is UMIA itself. Its spot pool went live at migration on 2026-09-02.
export default ventureVolume(7, "2026-09-02");
