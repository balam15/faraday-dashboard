#!/bin/sh
# Seed (or remove) demo scan data for a single application, so the dashboard,
# charts and findings views have something to show.
#
#   ./scripts/seed-demo.sh            # import demo scans
#   ./scripts/seed-demo.sh delete     # remove the demo app and all its data
#
# Config via env:
#   BASE_URL      default http://localhost:3000
#   APP           default demo-payment-service
#   FARADAY_USER  default admin
#   FARADAY_PASS  admin password (prompted if unset)
set -eu

BASE_URL="${BASE_URL:-http://localhost:3000}"
APP="${APP:-demo-payment-service}"
USER="${FARADAY_USER:-admin}"
ACTION="${1:-seed}"

COOKIES="$(mktemp)"
WORK="$(mktemp -d)"
cleanup() { rm -rf "$COOKIES" "$WORK"; }
trap cleanup EXIT

# ── Login ────────────────────────────────────────────────────────────
if [ -z "${FARADAY_PASS:-}" ]; then
  printf "Password for %s @ %s: " "$USER" "$BASE_URL" >&2
  stty -echo 2>/dev/null || true
  read -r FARADAY_PASS
  stty echo 2>/dev/null || true
  echo >&2
fi

code=$(curl -s -c "$COOKIES" -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$FARADAY_PASS\"}")
if [ "$code" != "200" ]; then
  echo "Login failed (HTTP $code). Check credentials / BASE_URL." >&2
  exit 1
fi

# ── Delete mode ──────────────────────────────────────────────────────
if [ "$ACTION" = "delete" ]; then
  id=$(curl -s -b "$COOKIES" "$BASE_URL/api/apps" \
    | python3 -c "import sys,json;
apps=json.load(sys.stdin)
m=[a['id'] for a in apps if a['name']=='$APP']
print(m[0] if m else '')")
  if [ -z "$id" ]; then
    echo "App '$APP' not found — nothing to delete." >&2
    exit 0
  fi
  curl -s -b "$COOKIES" -X DELETE "$BASE_URL/api/apps/$id" -o /dev/null -w ''
  echo "Deleted app '$APP' and all its scan data."
  exit 0
fi

# ── Generate scan files ──────────────────────────────────────────────
cat > "$WORK/trivy.json" <<'JSON'
{"SchemaVersion":2,"ArtifactName":"payment-service","Results":[
 {"Target":"payment-service (debian 12)","Class":"os-pkgs","Type":"debian","Vulnerabilities":[
   {"VulnerabilityID":"CVE-2021-44228","PkgName":"log4j","InstalledVersion":"2.14.1","FixedVersion":"2.17.1","Severity":"CRITICAL","Title":"log4j: Remote code execution via JNDI","CweIDs":["CWE-502"],"CVSS":{"nvd":{"V3Score":10.0}},"References":["https://nvd.nist.gov/vuln/detail/CVE-2021-44228"]},
   {"VulnerabilityID":"CVE-2022-22965","PkgName":"spring-core","InstalledVersion":"5.3.15","FixedVersion":"5.3.18","Severity":"HIGH","Title":"Spring4Shell RCE","CweIDs":["CWE-94"],"CVSS":{"nvd":{"V3Score":9.8}}},
   {"VulnerabilityID":"CVE-2023-1234","PkgName":"openssl","InstalledVersion":"3.0.2","FixedVersion":"3.0.8","Severity":"MEDIUM","Title":"OpenSSL denial of service"},
   {"VulnerabilityID":"CVE-2020-0001","PkgName":"zlib","InstalledVersion":"1.2.11","Severity":"LOW","Title":"zlib minor issue"}]},
 {"Target":"app/config/database.yml","Class":"secret","Secrets":[
   {"RuleID":"aws-access-key-id","Category":"AWS","Severity":"CRITICAL","Title":"AWS Access Key","StartLine":15,"Match":"AKIAIOSFODNN7EXAMPLE"}]}]}
JSON

cat > "$WORK/zap.xml" <<'XML'
<?xml version="1.0"?>
<OWASPZAPReport version="2.14.0"><site name="https://payment.example.com"><alerts>
 <alertitem><alert>Cross Site Scripting (Reflected)</alert><riskcode>3</riskcode><cweid>79</cweid><pluginid>40012</pluginid>
   <desc><![CDATA[Reflected XSS in the search parameter.]]></desc><solution><![CDATA[Encode user output.]]></solution>
   <instances><instance><uri>https://payment.example.com/search?q=test</uri></instance></instances></alertitem>
 <alertitem><alert>SQL Injection</alert><riskcode>3</riskcode><cweid>89</cweid><pluginid>40018</pluginid>
   <desc><![CDATA[Possible SQL injection in the id parameter.]]></desc><solution><![CDATA[Use parameterized queries.]]></solution>
   <instances><instance><uri>https://payment.example.com/invoice?id=1</uri></instance></instances></alertitem>
 <alertitem><alert>Missing Anti-CSRF Tokens</alert><riskcode>2</riskcode><cweid>352</cweid><pluginid>10202</pluginid>
   <desc><![CDATA[No CSRF token found.]]></desc><solution><![CDATA[Add anti-CSRF tokens.]]></solution>
   <instances><instance><uri>https://payment.example.com/transfer</uri></instance></instances></alertitem>
 <alertitem><alert>Cookie Without Secure Flag</alert><riskcode>1</riskcode><cweid>614</cweid><pluginid>10011</pluginid>
   <desc><![CDATA[A cookie is set without the Secure flag.]]></desc><solution><![CDATA[Set the Secure flag.]]></solution>
   <instances><instance><uri>https://payment.example.com/</uri></instance></instances></alertitem>
</alerts></site></OWASPZAPReport>
XML

cat > "$WORK/sarif.json" <<'JSON'
{"$schema":"https://json.schemastore.org/sarif-2.1.0.json","version":"2.1.0","runs":[
 {"tool":{"driver":{"name":"MegaLinter","rules":[
   {"id":"py/sql-injection","shortDescription":{"text":"SQL injection"},"properties":{"security-severity":"8.8","tags":["external/cwe/cwe-89"]},"help":{"text":"Use parameterized queries."}},
   {"id":"py/weak-hash","shortDescription":{"text":"Weak hashing algorithm"},"properties":{"security-severity":"5.9","tags":["external/cwe/cwe-327"]},"help":{"text":"Use SHA-256 or better."}},
   {"id":"py/hardcoded-secret","shortDescription":{"text":"Hardcoded secret"},"properties":{"security-severity":"7.5","tags":["external/cwe/cwe-798"]},"help":{"text":"Load secrets from the environment."}}]}},
  "results":[
   {"ruleId":"py/sql-injection","ruleIndex":0,"level":"error","message":{"text":"User input flows into a SQL query"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/payments/db.py"},"region":{"startLine":88}}}]},
   {"ruleId":"py/weak-hash","ruleIndex":1,"level":"warning","message":{"text":"MD5 used for hashing"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/auth/tokens.py"},"region":{"startLine":23}}}]},
   {"ruleId":"py/hardcoded-secret","ruleIndex":2,"level":"error","message":{"text":"Hardcoded API secret"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/config.py"},"region":{"startLine":12}}}]}]}]}
JSON

# Fortify FPR (a zip containing audit.fvdl) — built with python3 if available.
FPR=""
if command -v python3 >/dev/null 2>&1; then
  cat > "$WORK/audit.fvdl" <<'FVDL'
<?xml version="1.0"?>
<FVDL xmlns="xmlns://www.fortifysoftware.com/schema/fvdl">
 <Vulnerabilities>
  <Vulnerability>
   <ClassInfo><ClassID>C1</ClassID><Type>Path Manipulation</Type><Subtype>CWE-22</Subtype><DefaultSeverity>4.0</DefaultSeverity></ClassInfo>
   <InstanceInfo><InstanceID>i1</InstanceID><InstanceSeverity>4.0</InstanceSeverity>
     <MetaInfo><Group name="Fortify Priority Order">High</Group></MetaInfo></InstanceInfo>
   <AnalysisInfo><Unified><Trace><Primary><Entry><Node><SourceLocation path="src/files/upload.py" line="54"/></Node></Entry></Primary></Trace></Unified></AnalysisInfo>
  </Vulnerability>
  <Vulnerability>
   <ClassInfo><ClassID>C2</ClassID><Type>Privacy Violation</Type><Subtype>CWE-359</Subtype><DefaultSeverity>3.0</DefaultSeverity></ClassInfo>
   <InstanceInfo><InstanceID>i2</InstanceID><InstanceSeverity>3.0</InstanceSeverity>
     <MetaInfo><Group name="Fortify Priority Order">Medium</Group></MetaInfo></InstanceInfo>
   <AnalysisInfo><Unified><Trace><Primary><Entry><Node><SourceLocation path="src/users/profile.py" line="120"/></Node></Entry></Primary></Trace></Unified></AnalysisInfo>
  </Vulnerability>
 </Vulnerabilities>
 <Description classID="C1"><Abstract>Uncontrolled file path from user input.</Abstract><Recommendations>Validate and canonicalize file paths.</Recommendations></Description>
 <Description classID="C2"><Abstract>Sensitive personal data is logged.</Abstract><Recommendations>Do not log PII.</Recommendations></Description>
</FVDL>
FVDL
  python3 -c "import zipfile,sys; z=zipfile.ZipFile('$WORK/fortify.fpr','w'); z.write('$WORK/audit.fvdl','audit.fvdl'); z.close()"
  FPR="$WORK/fortify.fpr"
fi

# ── Import helper ────────────────────────────────────────────────────
import() { # file scan_type tag
  http=$(curl -s -b "$COOKIES" -o "$WORK/resp" -w '%{http_code}' \
    -X POST "$BASE_URL/api/import-scan" \
    -F "file=@$1" -F "app_name=$APP" -F "tag=$3" -F "scan_type=$2" \
    -F "team=Platform" -F "app_type=service")
  if [ "$http" = "200" ]; then
    n=$(python3 -c "import json;print(json.load(open('$WORK/resp'))['findings'])" 2>/dev/null || echo "?")
    echo "  ✓ $2 → $APP:$3 ($n findings)"
  else
    echo "  ✗ $2 → HTTP $http: $(cat "$WORK/resp")"
  fi
}

echo "Seeding demo data into '$APP' at $BASE_URL ..."
# Latest tag: full scan coverage
import "$WORK/trivy.json" "Trivy Scan"   "v2.4.1"
import "$WORK/zap.xml"    "ZAP Scan"     "v2.4.1"
import "$WORK/sarif.json" "SARIF"        "v2.4.1"
[ -n "$FPR" ] && import "$FPR" "Fortify Scan" "v2.4.1"
# Older tag: one scan, to show history
import "$WORK/trivy.json" "Trivy Scan"   "v2.4.0"

echo "Done. Open $BASE_URL/dashboard to see it."
echo "Remove later with:  ./scripts/seed-demo.sh delete"
