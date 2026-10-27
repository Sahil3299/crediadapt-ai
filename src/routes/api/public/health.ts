import { createFileRoute } from "@tanstack/react-router";
import { getBackendHealth } from "@/lib/loan/pipeline.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () => {
        const health = await getBackendHealth();
        return new Response(JSON.stringify(health), {
          status: 200,
          headers: cors,
        });
      },
    },
  },
});
