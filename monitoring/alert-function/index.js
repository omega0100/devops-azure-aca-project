// index.js
const https = require("https");
const { URL } = require("url");

function postSlack(webhookUrl, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const url = new URL(webhookUrl);
    const req = https.request(
      { method: "POST", hostname: url.hostname, path: url.pathname + url.search, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => { res.on("data", ()=>{}); res.on("end", resolve); }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function callMeBot(phone, apikey, text) {
  return new Promise((resolve, reject) => {
    const enc = encodeURIComponent(text);
    const path = `/call.php?phone=${encodeURIComponent(phone)}&text=${enc}&lang=en-US&apikey=${encodeURIComponent(apikey)}`;
    const req = https.request(
      { method: "GET", hostname: "api.callmebot.com", path },
      (res) => { res.on("data", ()=>{}); res.on("end", resolve); }
    );
    req.on("error", reject);
    req.end();
  });
}

// Try to extract essentials & metric info from Azure Monitor alert (both schemas)
function parseAzureAlert(body) {
  // Common Alert Schema
  if (body?.data?.essentials) {
    const e = body.data.essentials;
    const ctx = body.data.alertContext || {};
    const rule = e.alertRule || "unknown-rule";
    const sev  = e.severity || "Sev?";
    const cond = e.monitorCondition || "Unknown";
    const sig  = e.signalType || "Unknown";
    const target = (e.alertTargetIDs && e.alertTargetIDs[0]) || "unknown-target";
    const desc = e.description || "";

    // Try get metric detail if present
    let metricText = "";
    if (ctx?.conditionType) {
      const crits = ctx?.condition?.allOf || [];
      const parts = crits.map((c) => {
        const m = c?.metricName || "Metric";
        const op = c?.operator || "?";
        const thr= (c?.threshold !== undefined) ? c.threshold : "?";
        const agg= c?.timeAggregation || "Total";
        // dimension filters (e.g., statusCodeCategory)
        const dims = (c?.dimensions || []).map(d => `${d.name}=${d.value}`).join(", ");
        return `${m} ${op} ${thr} (${agg}${dims ? "; " + dims : ""})`;
      });
      metricText = parts.join(" | ");
    }

    return {
      title: `ALERT: ${rule} — ${cond}`,
      lines: [
        `Severity: ${sev}`,
        `Signal: ${sig}`,
        `Target: ${target}`,
        metricText && `Condition: ${metricText}`,
        desc && `Note: ${desc}`,
        `Portal: https://portal.azure.com/#view/Microsoft_Azure_Monitoring/AlertDetailsV2Blade/alertId/${encodeURIComponent(e.alertId || "")}`
      ].filter(Boolean)
    };
  }

  // Legacy / Non-Common: try top-level
  if (body?.essentials) {
    const e = body.essentials;
    return {
      title: `ALERT: ${e.alertRule || "unknown-rule"} — ${e.monitorCondition || "Unknown"}`,
      lines: [
        `Severity: ${e.severity || "Sev?"}`,
        `Signal: ${e.signalType || "Unknown"}`,
        `Target: ${(e.alertTargetIDs && e.alertTargetIDs[0]) || "unknown-target"}`,
        e.description ? `Note: ${e.description}` : null
      ].filter(Boolean)
    };
  }

  // Fallback: plain stringify
  return { title: "ALERT: Unrecognized payload", lines: [JSON.stringify(body).slice(0, 800)] };
}

module.exports = async function (context, req) {
  try {
    const SLACK = process.env.SLACK_WEBHOOK;
    const PHONE = process.env.CMB_PHONE;
    const KEY   = process.env.CMB_APIKEY;

    const body = req.body || {};
    const parsed = parseAzureAlert(body);

    // Map human-friendly titles by common patterns
    const title = parsed.title;
    let prefix = "General Alert";
    if (/5xx|5XX|5Xx/.test(parsed.lines.join(" "))) prefix = "Backend Errors (5xx)";
    if (/Requests/.test(parsed.lines.join(" ")) && /Total|Count/.test(parsed.lines.join(" "))) prefix = "High Traffic";
    if (/ApplicationGateway|agw/i.test(parsed.lines.join(" "))) prefix = "Gateway Issue";

    const slackMsg = `*${prefix}*\n*${title}*\n` + parsed.lines.map(l => `- ${l}`).join("\n");
    const voiceMsg = `${prefix}. ${title}. ${parsed.lines.join(". ")}`;

    // Send Slack
    if (SLACK) { await postSlack(SLACK, slackMsg); }

    // CallMeBot
    if (PHONE && KEY) { await callMeBot(PHONE, KEY, voiceMsg); }

    context.res = { status: 200, body: { ok: true } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { ok: false, error: String(err) } };
  }
};

