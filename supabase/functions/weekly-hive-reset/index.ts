import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getLocalWeekStart(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || "0", 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || "0", 10);
  const day = parseInt(parts.find(p => p.type === 'day')?.value || "0", 10);

  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = localDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  
  const mondayDate = new Date(localDate);
  mondayDate.setUTCDate(localDate.getUTCDate() + diff);

  const y = mondayDate.getUTCFullYear();
  const m = String(mondayDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(mondayDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  try {
    // 1. Authentication Check
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');
    
    if (!cronSecret) {
      throw new Error("CRON_SECRET environment variable is not set");
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse request body
    let dry_run = false;
    try {
      const text = await req.text();
      if (text) {
        const body = JSON.parse(text);
        dry_run = body.dry_run === true;
      }
    } catch (err) {
      console.warn("Failed to parse request body as JSON:", err);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Check Timing
    // The cron will run hourly. We check if the current UTC time, 
    // converted to each family's timezone, matches their reset_day and hour of reset_time.
    const nowUtc = new Date();

    const { data: families, error: familiesError } = await supabase
      .from("family_settings")
      .select("family_id, reset_day, reset_time, timezone");

    if (familiesError) throw familiesError;

    const dueFamilies = families.filter((f) => {
      try {
        // Format current time into family's timezone
        const options: Intl.DateTimeFormatOptions = { 
          timeZone: f.timezone || 'UTC',
          weekday: 'long', 
          hour: 'numeric',
          hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        // Extracts something like "Sunday, 23"
        const parts = formatter.formatToParts(nowUtc);
        const dayName = parts.find(p => p.type === 'weekday')?.value;
        const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || "0", 10);

        // Map dayName to reset_day (1=Mon, 7=Sun)
        const daysMap: Record<string, number> = {
          Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7
        };
        const currentDayOfWek = daysMap[dayName || ""] || 7;

        // Parse reset_time hour. reset_time looks like "23:59:59"
        const resetHour = parseInt(f.reset_time.split(":")[0], 10);

        return currentDayOfWek === f.reset_day && currentHour === resetHour;
      } catch (err) {
        console.error(`Error processing time for family ${f.family_id}:`, err);
        return false;
      }
    });

    const dueFamilyIds = dueFamilies.map(f => f.family_id);

    if (dueFamilyIds.length === 0) {
      return new Response(JSON.stringify({ message: "No families due for reset", dry_run }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1.5. Filter out families that are already settled for this week
    const dueFamiliesWithWeeks = dueFamilies.map((f) => {
      const currentWeekStartStr = getLocalWeekStart(nowUtc, f.timezone || 'UTC');
      
      const currentWeekStart = new Date(currentWeekStartStr);
      const nextWeekStartUtc = new Date(currentWeekStart);
      nextWeekStartUtc.setUTCDate(nextWeekStartUtc.getUTCDate() + 7);
      
      const y = nextWeekStartUtc.getUTCFullYear();
      const m = String(nextWeekStartUtc.getUTCMonth() + 1).padStart(2, '0');
      const d = String(nextWeekStartUtc.getUTCDate()).padStart(2, '0');
      const nextWeekStartStr = `${y}-${m}-${d}`;
      
      return {
        ...f,
        currentWeekStartStr,
        nextWeekStartStr
      };
    });

    const { data: settledFamilies, error: settledError } = await supabase
      .from("weekly_settlements")
      .select("family_id, week_start_date")
      .in("family_id", dueFamilyIds);
    
    if (settledError) throw settledError;

    const settledSet = new Set(
      settledFamilies?.map(s => `${s.family_id}:${s.week_start_date}`) || []
    );

    const familiesConfigsToProcess = dueFamiliesWithWeeks.filter(
      f => !settledSet.has(`${f.family_id}:${f.currentWeekStartStr}`)
    );

    if (familiesConfigsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "Families due for reset were already settled", dry_run }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const logs: any[] = [];

    for (const f of familiesConfigsToProcess) {
      if (!dry_run) {
        // Execute unified transactional database settlement RPC
        const { data: result, error: settlementError } = await supabase.rpc(
          "process_weekly_settlement",
          {
            p_family_id: f.family_id,
            p_week_start: f.currentWeekStartStr,
            p_is_early: false
          }
        );

        if (settlementError) {
          console.error(`Error settling family ${f.family_id}:`, settlementError.message);
          throw new Error(`Database error during settlement: ${settlementError.message}`);
        }

        logs.push({
          family_id: f.family_id,
          week_start: f.currentWeekStartStr,
          success: true,
          result
        });
      } else {
        logs.push({
          family_id: f.family_id,
          week_start: f.currentWeekStartStr,
          dry_run: true,
          message: "Dry run: would settle family and generate chores"
        });
      }
    }

    return new Response(JSON.stringify({  
      success: true, 
      dry_run, 
      processed_families: dueFamilyIds,
      logs 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Function error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
