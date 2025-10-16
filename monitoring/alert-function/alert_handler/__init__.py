import os, time, json, requests, urllib.parse
import azure.functions as func

SLACK_WEBHOOK = os.environ["SLACK_WEBHOOK"]
CMB_PHONE     = os.environ["CMB_PHONE"]
CMB_APIKEY    = os.environ["CMB_APIKEY"]
COOLDOWN      = int(os.getenv("COOLDOWN_SECONDS", "600"))
STATE_FILE    = "/tmp/last_call_map.json"

def _load_state():
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except:
        return {}

def _save_state(state):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f)
    except:
        pass

def _cooldown_ok(key: str) -> bool:
    state = _load_state()
    now = time.time()
    last = state.get(key, 0)
    if now - last >= COOLDOWN:
        state[key] = now
        _save_state(state)
        return True
    return False

def _post_slack(text: str):
    try:
        requests.post(SLACK_WEBHOOK, json={"text": text}, timeout=10)
    except Exception as e:
        print(f"Slack error: {e}")

def _call_callmebot(text: str):
    params = {
        "phone": CMB_PHONE,
        "text": text,
        "lang": "en-US",
        "apikey": CMB_APIKEY
    }
    url = "https://api.callmebot.com/call.php?" + urllib.parse.urlencode(params, safe="+")
    try:
        requests.get(url, timeout=15)
    except Exception as e:
        print(f"CallMeBot error: {e}")

def build_message_from_azure_monitor(payload: dict):
    ess = payload.get("data", {}).get("essentials", {})
    rule      = ess.get("alertRule", "Unknown alert")
    sev       = ess.get("severity", "Sev4")
    signal    = ess.get("signalType", "Metric")
    monitor   = ess.get("monitorCondition", "Fired")
    targetIDs = ess.get("alertTargetIDs", [])
    target    = targetIDs[0] if targetIDs else "Unknown resource"
    link      = ess.get("portalLink", "")
    msg = (f"[AZURE MONITOR] {monitor} — {rule}\n"
           f"Severity: {sev} | Signal: {signal}\n"
           f"Resource: {target}\n"
           f"{link}")
    alert_key = f"azure::{rule}::{sev}"
    return msg, sev, alert_key

def build_message_from_github(payload: dict):
    repo   = payload.get("repository", "unknown-repo")
    flow   = payload.get("workflow", "unknown-workflow")
    branch = payload.get("branch", "unknown-branch")
    url    = payload.get("url", "")
    msg = (f"[GITHUB ACTIONS] Pipeline failed\n"
           f"Repository: {repo}\n"
           f"Workflow: {flow}\n"
           f"Branch: {branch}\n"
           f"{url}")
    return msg, "Sev2", f"github::{repo}::{flow}::{branch}"

def identify_source(payload: dict):
    if isinstance(payload, dict) and "data" in payload and "essentials" in payload.get("data", {}):
        return "azure"
    return "github"

def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except Exception:
        return func.HttpResponse("Invalid JSON", status_code=400)

    source = identify_source(body)
    if source == "azure":
        text, severity, key = build_message_from_azure_monitor(body)
    else:
        text, severity, key = build_message_from_github(body)

    _post_slack(text)

    if severity in ("Sev0", "Sev1", "Sev2"):
        if _cooldown_ok(key):
            short_text = text.split("\n")[0] + " — Check Slack for details."
            _call_callmebot(short_text)
        else:
            print("Cooldown active; skipping CallMeBot.")

    return func.HttpResponse("ok", status_code=200)

