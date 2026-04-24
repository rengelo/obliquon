import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

type StartRunBody = {
  grade: number;
};

type SubmitScoreBody = {
  runId: string;
  playerName: string;
  score: number;
  grade: number;
  timeMs: number;
};

type GetLeaderboardsBody = {
  grade: number;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 20);
}

function isValidName(name: string) {
  return /^[A-Za-z0-9 _.-]{1,20}$/.test(name);
}

function badRequest(message: string, origin: string | null) {
  return json({ error: message }, 400, origin);
}

async function startRun(body: StartRunBody, origin: string | null) {
  if (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 999) {
    return badRequest("grade must be an integer between 1 and 999", origin);
  }

  const { data, error } = await supabase
    .from("leaderboard_runs")
    .insert({
      grade_started: body.grade
    })
    .select("id, created_at, expires_at, grade_started")
    .single();

  if (error) {
    console.error("startRun insert failed", error);
    return json({ error: "could not create run" }, 500, origin);
  }

  return json({ run: data }, 200, origin);
}

async function submitScore(body: SubmitScoreBody, origin: string | null) {
  const playerName = normalizeName(body.playerName ?? "");

  if (!body.runId || typeof body.runId !== "string") {
    return badRequest("runId is required", origin);
  }
  if (!isValidName(playerName)) {
    return badRequest("playerName must be 1-20 chars: letters, numbers, space, _, -, .", origin);
  }
  if (!Number.isInteger(body.score) || body.score < 0 || body.score > 100000000) {
    return badRequest("score must be an integer between 0 and 100000000", origin);
  }
  if (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 999) {
    return badRequest("grade must be an integer between 1 and 999", origin);
  }
  if (!Number.isInteger(body.timeMs) || body.timeMs < 1000 || body.timeMs > 7200000) {
    return badRequest("timeMs must be between 1000 and 7200000", origin);
  }

  const { data: run, error: runError } = await supabase
    .from("leaderboard_runs")
    .select("id, created_at, expires_at, grade_started, consumed_at")
    .eq("id", body.runId)
    .single();

  if (runError || !run) {
    return badRequest("run not found", origin);
  }
  if (run.consumed_at) {
    return badRequest("run already consumed", origin);
  }
  if (body.grade !== run.grade_started) {
    return badRequest("grade does not match run", origin);
  }

  const now = Date.now();
  const createdAt = new Date(run.created_at).getTime();
  const expiresAt = new Date(run.expires_at).getTime();

  if (now > expiresAt) {
    return badRequest("run expired", origin);
  }

  const elapsedMs = now - createdAt;
  if (body.timeMs - elapsedMs > 2500) {
    return badRequest("submitted time is larger than server-observed elapsed time", origin);
  }

  const { error: scoreError } = await supabase
    .from("leaderboard_scores")
    .insert({
      player_name: playerName,
      score: body.score,
      grade: body.grade,
      time_ms: body.timeMs,
      run_id: body.runId
    });

  if (scoreError) {
    console.error("submitScore insert failed", scoreError);
    return json({ error: "could not save score" }, 500, origin);
  }

  const { error: updateError } = await supabase
    .from("leaderboard_runs")
    .update({
      consumed_at: new Date(now).toISOString(),
      consumed_by_name: playerName,
      submitted_grade: body.grade,
      submitted_score: body.score,
      submitted_time_ms: body.timeMs
    })
    .eq("id", body.runId)
    .is("consumed_at", null);

  if (updateError) {
    console.error("submitScore update failed", updateError);
    return json({ error: "score saved but run could not be finalized" }, 500, origin);
  }

  return json({ ok: true }, 200, origin);
}

async function getLeaderboards(body: GetLeaderboardsBody, origin: string | null) {
  if (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 999) {
    return badRequest("grade must be an integer between 1 and 999", origin);
  }

  const { data: allTime, error: allTimeError } = await supabase
    .from("leaderboard_scores")
    .select("player_name, score, grade, time_ms, created_at")
    .order("score", { ascending: false })
    .order("time_ms", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);

  if (allTimeError) {
    console.error("allTime query failed", allTimeError);
    return json({ error: "could not load all-time leaderboard" }, 500, origin);
  }

  const { data: bestScores, error: bestScoreError } = await supabase
    .from("leaderboard_scores")
    .select("player_name, score, grade, time_ms, created_at")
    .eq("grade", body.grade)
    .order("score", { ascending: false })
    .order("time_ms", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(5);

  if (bestScoreError) {
    console.error("bestScore query failed", bestScoreError);
    return json({ error: "could not load grade best score" }, 500, origin);
  }

  const { data: fastestTimes, error: fastestTimeError } = await supabase
    .from("leaderboard_scores")
    .select("player_name, score, grade, time_ms, created_at")
    .eq("grade", body.grade)
    .order("time_ms", { ascending: true })
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (fastestTimeError) {
    console.error("fastestTime query failed", fastestTimeError);
    return json({ error: "could not load grade fastest time" }, 500, origin);
  }

  return json(
    {
      top_scores_all_time: allTime ?? [],
      best_scores_for_grade: bestScores ?? [],
      fastest_times_for_grade: fastestTimes ?? []
    },
    200,
    origin
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(origin)
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json body", origin);
  }

  const action = String(body.action ?? "");

  if (action === "start-run") {
    return startRun(body as unknown as StartRunBody, origin);
  }

  if (action === "submit-score") {
    return submitScore(body as unknown as SubmitScoreBody, origin);
  }

  if (action === "get-leaderboards") {
    return getLeaderboards(body as unknown as GetLeaderboardsBody, origin);
  }

  return badRequest("unknown action", origin);
});
