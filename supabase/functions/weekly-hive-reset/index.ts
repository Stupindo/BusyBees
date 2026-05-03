import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { dry_run = false } = await req.json().catch(() => ({}));

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
    const weekStartUtc = new Date(nowUtc);
    const day = weekStartUtc.getUTCDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() + diff);
    const wsOptions: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' };
    const wsParts = new Intl.DateTimeFormat('en-US', wsOptions).formatToParts(weekStartUtc);
    const currentWeekStartStr = `${wsParts.find(p=>p.type==='year')?.value}-${wsParts.find(p=>p.type==='month')?.value}-${wsParts.find(p=>p.type==='day')?.value}`;

    const { data: settledFamilies, error: settledError } = await supabase
      .from("weekly_settlements")
      .select("family_id")
      .in("family_id", dueFamilyIds)
      .eq("week_start_date", currentWeekStartStr);
    
    if (settledError) throw settledError;

    const settledIds = new Set(settledFamilies?.map(f => f.family_id) || []);
    const familiesToProcess = dueFamilyIds.filter(id => !settledIds.has(id));

    if (familiesToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "Families due for reset were already settled", dry_run }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Process each due family
    const { data: children, error: childrenError } = await supabase
      .from("members")
      .select("id, family_id")
      .in("family_id", familiesToProcess)
      .eq("role", "child");

    if (childrenError) throw childrenError;

    const logs: any[] = [];

    for (const child of children || []) {
      // Get template info
      const { data: template, error: templateError } = await supabase
        .from("weekly_templates")
        .select("id, total_reward, penalty_per_task")
        .eq("member_id", child.id)
        .single();
      
      if (templateError || !template) continue;

      // Count pending mandatory chores (is_backlog=false)
      const { data: pendingChores, error: choresError } = await supabase
        .from("chore_instances")
        .select("id, status, chore_id")
        .eq("member_id", child.id)
        .eq("status", "pending");

      if (choresError) throw choresError;

      // Fetch chore details to filter by is_backlog
      const pendingIds = (pendingChores || []).map((c: any) => c.chore_id);
      let unfinishedCount = 0;
      if (pendingIds.length > 0) {
        const { data: mandatoryChores } = await supabase
          .from("chores")
          .select("id")
          .in("id", pendingIds)
          .eq("is_backlog", false);
        unfinishedCount = mandatoryChores?.length || 0;
      }

      // Sum extra_reward for done backlog chores this week
      const { data: doneBacklogInstances } = await supabase
        .from("chore_instances")
        .select("chore_id")
        .eq("member_id", child.id)
        .eq("status", "done");
      
      let bonusReward = 0;
      const doneBacklogIds = (doneBacklogInstances || []).map((c: any) => c.chore_id);
      if (doneBacklogIds.length > 0) {
        const { data: backlogChores } = await supabase
          .from("chores")
          .select("extra_reward")
          .in("id", doneBacklogIds)
          .eq("is_backlog", true);
        bonusReward = (backlogChores || []).reduce((sum: number, c: any) => sum + (c.extra_reward || 0), 0);
      }

      const totalReward = template.total_reward || 0;
      const penalty = template.penalty_per_task || 0;

      const reward = Math.max(0, totalReward - (unfinishedCount * penalty)) + bonusReward;
      
      logs.push({ child_id: child.id, unfinishedCount, bonusReward, reward });

      if (!dry_run) {
        // 3. Update Ledger
        if (reward > 0) {
          await supabase.from("transactions").insert({
            member_id: child.id,
            amount: reward,
            type: "earning",
            description: "Weekly allowance harvest"
          });
        }

        // Mark old chore instances as 'failed' if they were pending
        const pendingIds = choresToProcess
            .filter((c: any) => c.status === "pending")
            .map((c: any) => c.id);

        if (pendingIds.length > 0) {
           await supabase
             .from("chore_instances")
             .update({ status: "failed" })
             .in("id", pendingIds);
        }

        // 4. New Week: Generate fresh chore instances based on weekly_templates
        const familyResetsDay = dueFamilies.find(f => f.family_id === child.family_id);
        
        // Calculate the "next day" for week_start_date relative to family timezone
        const nextDayDate = new Date(nowUtc);
        nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
        
        // Form a plain date string like "2024-04-10" using Intl format parts in local tz
        const dateOptions: Intl.DateTimeFormatOptions = { 
          timeZone: familyResetsDay?.timezone || 'UTC', 
          year: 'numeric', month: '2-digit', day: '2-digit' 
        };
        const dateParts = new Intl.DateTimeFormat('en-US', dateOptions).formatToParts(nextDayDate);
        const y = dateParts.find(p => p.type === 'year')?.value;
        const m = dateParts.find(p => p.type === 'month')?.value;
        const d = dateParts.find(p => p.type === 'day')?.value;
        const weekStartDateStr = `${y}-${m}-${d}`;

        const { data: templateChores, error: tChoresError } = await supabase
           .from("chores")
           .select("id, is_backlog")
           .eq("template_id", template.id)
           .eq("is_deleted", false); // Skip deleted

        if (!tChoresError && templateChores) {
           const newInstances = templateChores.map((tc: any) => ({
             chore_id: tc.id,
             member_id: child.id,
             status: "pending",
             week_start_date: weekStartDateStr
           }));

           if (newInstances.length > 0) {
             await supabase.from("chore_instances").insert(newInstances);
           }
        }
      }
    }

    if (!dry_run) {
      // Mark all processed families as settled for this week
      // Calculate current week start date
      const weekStartUtc = new Date(nowUtc);
      const day = weekStartUtc.getUTCDay(); // 0=Sun
      const diff = (day === 0 ? -6 : 1 - day);
      weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() + diff);
      const wsOptions: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' };
      const wsPartsForInsert = new Intl.DateTimeFormat('en-US', wsOptions).formatToParts(weekStartUtc);
      const insertWeekStartStr = `${wsPartsForInsert.find(p=>p.type==='year')?.value}-${wsPartsForInsert.find(p=>p.type==='month')?.value}-${wsPartsForInsert.find(p=>p.type==='day')?.value}`;
      
      for (const familyId of familiesToProcess) {
         await supabase.from("weekly_settlements").insert({
           family_id: familyId,
           week_start_date: insertWeekStartStr,
           is_early: false
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
