import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sendEmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.warn("No RESEND_API_KEY configured — cannot send email");
      return false;
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Market Alerts <alerts@resend.dev>",
        to: [to],
        subject,
        html: htmlBody,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Resend API error:", resp.status, errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}

function buildSignalEmail(signals: Array<{ symbol: string; name: string; action: string; confidence: number; reasoning: string; ai_analysis: string | null; current_price: number; target_price: number | null; stop_loss: number | null; risk_level: string }>): string {
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Market Signal Alerts</h2>
      <p style="color: #475569;">Here are the latest signals from your market analysis system:</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;"/>
  `;

  for (const s of signals) {
    const actionColor = s.action === "BUY" ? "#16a34a" : s.action === "SELL" ? "#dc2626" : "#64748b";
    html += `
      <div style="margin-bottom: 20px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #1e293b;">${s.name} (${s.symbol})</h3>
          <span style="background: ${actionColor}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;">${s.action}</span>
        </div>
        <p style="color: #475569; margin: 8px 0;">Current price: $${s.current_price.toFixed(2)} | Confidence: ${s.confidence.toFixed(0)}% | Risk: ${s.risk_level}</p>
        <p style="color: #334155; margin: 4px 0;">${s.reasoning}</p>
        ${s.ai_analysis ? `<p style="color: #6366f1; margin: 4px 0; font-style: italic;">AI: ${s.ai_analysis}</p>` : ""}
        ${s.target_price ? `<p style="color: #475569; margin: 4px 0;">Target: $${s.target_price.toFixed(2)}</p>` : ""}
        ${s.stop_loss ? `<p style="color: #475569; margin: 4px 0;">Stop loss: $${s.stop_loss.toFixed(2)}</p>` : ""}
      </div>
    `;
  }

  html += `
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;"/>
      <p style="color: #94a3b8; font-size: 12px;">This is an automated alert from your Market Analysis System. Not financial advice.</p>
    </div>
  `;

  return html;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("alert_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings || !settings.is_active || !settings.email) {
      return new Response(
        JSON.stringify({ message: "Alerts disabled or no email configured", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Fetch recent signals with asset info (no broken join — fetch separately)
    const { data: recentSignals } = await supabase
      .from("signals")
      .select("id, asset_id, action, confidence, reasoning, ai_analysis, target_price, stop_loss, risk_level, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!recentSignals || recentSignals.length === 0) {
      return new Response(
        JSON.stringify({ message: "No recent signals to alert on", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch assets for symbol/name lookup
    const assetIds = [...new Set(recentSignals.map((s: any) => s.asset_id))];
    const { data: assetRows } = await supabase
      .from("assets")
      .select("id, symbol, name")
      .in("id", assetIds);

    const assetMap = new Map<string, { symbol: string; name: string }>();
    for (const a of (assetRows ?? []) as any[]) {
      assetMap.set(a.id, { symbol: a.symbol, name: a.name });
    }

    // Fetch latest prices for each asset
    const priceMap = new Map<string, number>();
    for (const assetId of assetIds) {
      const { data: priceData } = await supabase
        .from("price_snapshots")
        .select("price")
        .eq("asset_id", assetId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (priceData) {
        priceMap.set(assetId, (priceData as any).price);
      }
    }

    const eligibleSignals = (recentSignals as any[])
      .filter((s) => s.confidence >= settings.min_confidence)
      .filter((s) => {
        if (s.action === "BUY" && settings.alert_on_buy) return true;
        if (s.action === "SELL" && settings.alert_on_sell) return true;
        return false;
      });

    if (eligibleSignals.length === 0) {
      return new Response(
        JSON.stringify({ message: "No signals met alert criteria", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedSignals = eligibleSignals.map((s) => {
      const asset = assetMap.get(s.asset_id);
      return {
        symbol: asset?.symbol ?? "Unknown",
        name: asset?.name ?? "Unknown",
        action: s.action,
        confidence: s.confidence,
        reasoning: s.reasoning,
        ai_analysis: s.ai_analysis,
        current_price: priceMap.get(s.asset_id) ?? 0,
        target_price: s.target_price,
        stop_loss: s.stop_loss,
        risk_level: s.risk_level,
      };
    });

    const subject = `Market Alert: ${eligibleSignals.length} new signal${eligibleSignals.length > 1 ? "s" : ""}`;
    const htmlBody = buildSignalEmail(formattedSignals);
    const sent = await sendEmail(settings.email, subject, htmlBody);

    const alertLogs = eligibleSignals.map((s) => ({
      asset_id: s.asset_id ?? null,
      alert_type: s.action === "BUY" ? "BUY_SIGNAL" as const : "SELL_SIGNAL" as const,
      message: `${assetMap.get(s.asset_id)?.symbol ?? "Unknown"}: ${s.action} at ${s.confidence}% confidence`,
      delivery_method: "EMAIL" as const,
      status: sent ? "SENT" as const : "FAILED" as const,
    }));

    if (alertLogs.length > 0) {
      await supabase.from("alert_history").insert(alertLogs);
    }

    return new Response(
      JSON.stringify({
        message: sent ? `Sent alert email to ${settings.email}` : "Email send failed (no RESEND_API_KEY configured)",
        sent: sent ? 1 : 0,
        signal_count: eligibleSignals.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-alerts error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
