import type { Client } from "@elastic/elasticsearch";
import { kibana, KIBANA_URL } from "../../src/lib/agent/kibana";

const DASHBOARD_ID = "conference-pulse";

// Vega-Lite panels query Elasticsearch directly, so the dashboard needs no data views or Lens state.
function vegaBars(opts: { index: string; aggs: Record<string, unknown>; path: string; x: string; xType: string; title: string; color?: string; timefield?: string }) {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: opts.title,
    data: {
      url: {
        index: opts.index,
        ...(opts.timefield ? { "%context%": true, "%timefield%": opts.timefield } : { "%context%": true }),
        body: { size: 0, aggs: opts.aggs },
      },
      format: { property: opts.path },
    },
    mark: { type: "bar", tooltip: true, color: opts.color ?? "#0B64DD" },
    encoding: {
      x: { field: opts.x, type: opts.xType, sort: opts.xType === "nominal" ? "-y" : undefined, title: null },
      y: { field: "doc_count", type: "quantitative", title: "count" },
    },
  };
}

const PANELS: { id: string; title: string; w: number; h: number; spec: unknown; requiresIndex?: string }[] = [
  {
    id: "cm-track-mix",
    title: "Track mix",
    w: 24,
    h: 15,
    spec: vegaBars({
      index: "sessions",
      title: "Talks per track",
      aggs: { tracks: { terms: { field: "tracks", size: 20 }, aggs: {} } },
      path: "aggregations.tracks.buckets",
      x: "key",
      xType: "nominal",
    }),
  },
  {
    id: "cm-busiest-hours",
    title: "Busiest hours (Mountain time)",
    w: 24,
    h: 15,
    spec: vegaBars({
      index: "sessions",
      title: "Talks starting per hour (America/Denver)",
      aggs: {
        hours: { date_histogram: { field: "starts_at", calendar_interval: "1h", time_zone: "America/Denver", min_doc_count: 1 } },
      },
      path: "aggregations.hours.buckets",
      x: "key",
      xType: "temporal",
      color: "#16C5C0",
    }),
  },
  {
    id: "cm-signals-timeline",
    title: "Room signals timeline",
    w: 48,
    h: 14,
    requiresIndex: "room-signals",
    spec: {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      title: "Room-full and crowded signals over time",
      data: {
        url: {
          index: "room-signals",
          "%context%": true,
          "%timefield%": "@timestamp",
          body: {
            size: 0,
            aggs: {
              t: {
                date_histogram: { field: "@timestamp", fixed_interval: "10m", time_zone: "America/Denver", min_doc_count: 0 },
                aggs: { s: { terms: { field: "signal", size: 5 } } },
              },
            },
          },
        },
        format: { property: "aggregations.t.buckets" },
      },
      transform: [{ flatten: ["s.buckets"], as: ["sig"] }, { calculate: "datum.sig.key", as: "signal" }, { calculate: "datum.sig.doc_count", as: "n" }],
      mark: { type: "bar", tooltip: true },
      encoding: {
        x: { field: "key", type: "temporal", title: null },
        y: { field: "n", type: "quantitative", title: "signals" },
        color: { field: "signal", type: "nominal" },
      },
    },
  },
  {
    id: "cm-rooms-map",
    title: "Rooms map",
    w: 48,
    h: 20,
    requiresIndex: "rooms",
    spec: {
      $schema: "https://vega.github.io/schema/vega/v5.json",
      config: { kibana: { type: "map", latitude: 40.7665, longitude: -111.8945, zoom: 15, mapStyle: "default" } },
      data: [
        {
          name: "rooms",
          url: { index: "rooms", body: { size: 200, _source: ["name", "building", "location"] } },
          format: { property: "hits.hits" },
          transform: [{ type: "geopoint", projection: "projection", fields: ["_source.location.lon", "_source.location.lat"] }],
        },
      ],
      marks: [
        { type: "symbol", from: { data: "rooms" }, encode: { update: { x: { field: "x" }, y: { field: "y" }, size: { value: 200 }, fill: { value: "#F04E98" }, tooltip: { signal: "datum._source.name + ' · ' + datum._source.building" } } } },
      ],
    },
  },
];

export async function ensureDashboard(es: Client): Promise<string[]> {
  const panels = [];
  const skipped: string[] = [];
  for (const p of PANELS) {
    if (p.requiresIndex && !(await es.indices.exists({ index: p.requiresIndex }))) skipped.push(`${p.title} (needs ${p.requiresIndex})`);
    else panels.push(p);
  }
  const visualizations = panels.map((p) => ({
    type: "visualization",
    id: p.id,
    attributes: {
      title: p.title,
      description: "",
      uiStateJSON: "{}",
      visState: JSON.stringify({ title: p.title, type: "vega", aggs: [], params: { spec: JSON.stringify(p.spec, null, 2) } }),
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: "", language: "kuery" }, filter: [] }) },
    },
  }));
  let y = 0;
  let x = 0;
  const panelsJSON = panels.map((p, i) => {
    if (x + p.w > 48) {
      x = 0;
      y += 15;
    }
    const gridData = { x, y, w: p.w, h: p.h, i: String(i + 1) };
    x += p.w;
    return { type: "visualization", panelIndex: String(i + 1), gridData, embeddableConfig: {}, panelRefName: `panel_${i}` };
  });
  const dashboard = {
    type: "dashboard",
    id: DASHBOARD_ID,
    attributes: {
      title: "Conference Pulse · KubeCon NA 2026",
      description: "Track mix, busiest hours, live room signals, and the rooms map. Created by npm run elastic:setup.",
      panelsJSON: JSON.stringify(panelsJSON),
      optionsJSON: JSON.stringify({ useMargins: true, hidePanelTitles: false }),
      timeRestore: true,
      timeFrom: "2026-11-09T00:00:00-07:00",
      timeTo: "2026-11-13T00:00:00-07:00",
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: "", language: "kuery" }, filter: [] }) },
    },
    references: panels.map((p, i) => ({ name: `panel_${i}`, type: "visualization", id: p.id })),
  };
  await kibana("POST", "/api/saved_objects/_bulk_create?overwrite=true", [...visualizations, dashboard]);
  return [
    `dashboard with ${panels.length} panels: ${KIBANA_URL}/app/dashboards#/view/${DASHBOARD_ID}`,
    ...skipped.map((s) => `skipped panel ${s}`),
  ];
}
