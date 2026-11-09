import { Client } from "@elastic/elasticsearch";

let client: Client | null = null;

export function getEs(): Client {
  if (client) return client;
  const node = process.env.ES_URL;
  if (!node) throw new Error("ES_URL is not set. Copy .env.example to .env.local and fill it in.");
  const apiKey = process.env.ES_API_KEY;
  const username = process.env.ES_USERNAME;
  const password = process.env.ES_PASSWORD;
  client = new Client({
    node,
    auth: apiKey ? { apiKey } : username && password ? { username, password } : undefined,
    requestTimeout: 120_000,
  });
  return client;
}
