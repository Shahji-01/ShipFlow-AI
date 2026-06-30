import { EventSchemas, Inngest } from "inngest";
import type { ShipFlowEvents } from "./events";

/**
 * Shared Inngest client for ShipFlow AI workflows.
 * All workflow functions should use this client instance.
 */
export const inngest = new Inngest({
  id: "shipflow-ai",
  schemas: new EventSchemas().fromRecord<ShipFlowEvents>(),
});
