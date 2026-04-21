#!/usr/bin/env bash
# 幂等地向 Casdoor built-in 组织批量创建业务角色。
# 存在则跳过；不存在则通过 /api/add-role 创建。
#
# 用法：
#   CASDOOR_USER=zsbgnw CASDOOR_PASS='By@123456.' bash scripts/seed-roles.sh
#
# 可选环境变量：
#   CASDOOR_URL   默认 https://casdoor.ashyglacier-8207efd2.eastasia.azurecontainerapps.io
#   CASDOOR_ORG   默认 built-in
#   CASDOOR_APP   登录用的 application，默认 app-built-in
#   DRY_RUN=1     只打印要做什么，不真正写入
set -euo pipefail

CASDOOR_URL="${CASDOOR_URL:-https://casdoor.ashyglacier-8207efd2.eastasia.azurecontainerapps.io}"
CASDOOR_ORG="${CASDOOR_ORG:-built-in}"
CASDOOR_APP="${CASDOOR_APP:-app-built-in}"
DRY_RUN="${DRY_RUN:-0}"

: "${CASDOOR_USER:?CASDOOR_USER is required}"
: "${CASDOOR_PASS:?CASDOOR_PASS is required}"

# role 定义：每行 = "name|displayName|description|inheritsCsv"
# inheritsCsv 空表示无继承；多个继承用逗号分隔，格式 owner/name。
# 创建顺序必须：被继承的先建（底层在前），以避免 add-role 时引用不存在的 role。
ROLES=(
  "finance_staff|财务专员|Finance staff|"
  "operation_staff|运营专员|Operation staff|"
  "sales_staff|销售专员|Sales staff|"
  "procurement_staff|采购专员|Procurement staff|"
  "engineer|工程师|Engineer|"
  "coo|COO|Chief Operating Officer|"
  "finance_manager|财务主管|Finance manager (inherits finance_staff)|${CASDOOR_ORG}/finance_staff"
  "operation_manager|运营主管|Operation manager (inherits operation_staff)|${CASDOOR_ORG}/operation_staff"
  "sales_manager|销售主管|Sales manager (inherits sales_staff)|${CASDOOR_ORG}/sales_staff"
  "procurement_manager|采购主管|Procurement manager (inherits procurement_staff)|${CASDOOR_ORG}/procurement_staff"
  "engineer_senior|高级工程师|Senior engineer (inherits engineer)|${CASDOOR_ORG}/engineer"
  "engineer_expert|专家|Expert (inherits engineer_senior)|${CASDOOR_ORG}/engineer_senior"
)

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

log() { printf '[seed-roles] %s\n' "$*" >&2; }

log "login as ${CASDOOR_USER} @ ${CASDOOR_URL}"
login_body=$(jq -cn \
  --arg app "$CASDOOR_APP" \
  --arg org "$CASDOOR_ORG" \
  --arg u   "$CASDOOR_USER" \
  --arg p   "$CASDOOR_PASS" \
  '{application:$app, organization:$org, username:$u, password:$p, autoSignin:true, type:"login"}' 2>/dev/null) || {
    # jq 缺失时 fallback（密码里有 @. 等字符，手工转义需要注意）
    esc_pass=$(printf '%s' "$CASDOOR_PASS" | sed 's/\\/\\\\/g; s/"/\\"/g')
    login_body="{\"application\":\"${CASDOOR_APP}\",\"organization\":\"${CASDOOR_ORG}\",\"username\":\"${CASDOOR_USER}\",\"password\":\"${esc_pass}\",\"autoSignin\":true,\"type\":\"login\"}"
  }

login_resp=""
for i in 1 2 3 4 5 6 7 8; do
  if login_resp=$(curl -sS -c "$COOKIE_JAR" -X POST "${CASDOOR_URL}/api/login" \
        -H "Content-Type: application/json" \
        -d "$login_body" --max-time 30 2>/dev/null) && grep -q '"status": *"ok"' <<<"$login_resp"; then
    break
  fi
  log "login attempt $i failed, retrying..."
  login_resp=""
  sleep $((i*2))
done
if [ -z "$login_resp" ] || ! grep -q '"status": *"ok"' <<<"$login_resp"; then
  log "login FAILED after retries: ${login_resp:-<empty>}"
  exit 1
fi

# 拉 accessToken（带 Bearer 更稳，一条连接也能跑完）
account_resp=""
for i in 1 2 3 4 5 6 7 8; do
  if account_resp=$(curl -sS -b "$COOKIE_JAR" "${CASDOOR_URL}/api/get-account" \
        --max-time 30 2>/dev/null) && grep -q '"status": *"ok"' <<<"$account_resp"; then
    break
  fi
  log "get-account attempt $i failed, retrying..."
  account_resp=""
  sleep $((i*2))
done
if [ -z "$account_resp" ]; then
  log "get-account kept failing"
  exit 1
fi

TOKEN=$(sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' <<<"$account_resp" | head -1)
if [ -z "$TOKEN" ]; then
  # 兼容带空格的 JSON 格式
  TOKEN=$(sed -n 's/.*"accessToken": *"\([^"]*\)".*/\1/p' <<<"$account_resp" | head -1)
fi
if [ -z "$TOKEN" ]; then
  log "failed to extract accessToken from /api/get-account"
  exit 1
fi
log "logged in, token len=${#TOKEN}"

AUTH=(-H "Authorization: Bearer $TOKEN")

role_exists() {
  local name="$1"
  local resp=""
  local i
  # ACA 偶发 SSL reset，手动重试并要求响应里必须带 status:ok，否则视为请求失败
  for i in 1 2 3 4 5 6; do
    if resp=$(curl -sS "${AUTH[@]}" "${CASDOOR_URL}/api/get-role?id=${CASDOOR_ORG}/${name}" \
               --max-time 30 2>/dev/null) && grep -q '"status": *"ok"' <<<"$resp"; then
      # data: null → 不存在；data: { ... } → 存在
      if grep -q '"data": *null' <<<"$resp"; then
        return 1
      fi
      return 0
    fi
    sleep $((i*2))
  done
  log "  ! get-role for ${name} kept failing, last resp: ${resp:-<empty>}"
  return 2
}

# 构造 body 并写入临时文件 —— Windows Git Bash 下用 -d "$var" 会走 CreateProcessW
# 的 codepage 转码导致中文乱码；-d @file 直接走 POSIX read，保持 UTF-8。
write_role_body() {
  local out="$1" name="$2" display="$3" desc="$4" inherits_csv="$5"
  local inherits_json='[]'
  if [ -n "$inherits_csv" ]; then
    inherits_json='['"$(awk -v s="$inherits_csv" 'BEGIN{n=split(s,a,",");for(i=1;i<=n;i++){printf (i>1?",":""); printf "\"%s\"",a[i]}}')"']'
  fi
  printf '{"owner":"%s","name":"%s","createdTime":"","displayName":"%s","description":"%s","users":[],"groups":[],"roles":%s,"domains":[],"isEnabled":true}' \
    "$CASDOOR_ORG" "$name" "$display" "$desc" "$inherits_json" > "$out"
}

add_role() {
  local name="$1" display="$2" desc="$3" inherits_csv="$4"
  local body_file
  body_file=$(mktemp)
  write_role_body "$body_file" "$name" "$display" "$desc" "$inherits_csv"

  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would POST add-role: $(cat "$body_file")"
    rm -f "$body_file"
    return 0
  fi

  local resp="" i
  for i in 1 2 3 4 5 6; do
    if resp=$(curl -sS "${AUTH[@]}" -X POST "${CASDOOR_URL}/api/add-role" \
        -H "Content-Type: application/json" \
        --data @"$body_file" --max-time 30 2>/dev/null) && grep -q '"status": *"ok"' <<<"$resp"; then
      log "  + created ${CASDOOR_ORG}/${name}"
      rm -f "$body_file"
      return 0
    fi
    if role_exists "$name"; then
      log "  + created ${CASDOOR_ORG}/${name} (confirmed via get-role after retry)"
      rm -f "$body_file"
      return 0
    fi
    sleep $((i*2))
  done
  log "  ! add-role FAILED for ${name}: ${resp:-<empty>}"
  rm -f "$body_file"
  return 1
}

update_role() {
  local name="$1" display="$2" desc="$3" inherits_csv="$4"
  local body_file
  body_file=$(mktemp)
  write_role_body "$body_file" "$name" "$display" "$desc" "$inherits_csv"

  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would POST update-role ${name}: $(cat "$body_file")"
    rm -f "$body_file"
    return 0
  fi

  local resp="" i
  for i in 1 2 3 4 5 6; do
    if resp=$(curl -sS "${AUTH[@]}" -X POST "${CASDOOR_URL}/api/update-role?id=${CASDOOR_ORG}/${name}" \
        -H "Content-Type: application/json" \
        --data @"$body_file" --max-time 30 2>/dev/null) && grep -q '"status": *"ok"' <<<"$resp"; then
      log "  ~ updated ${CASDOOR_ORG}/${name}"
      rm -f "$body_file"
      return 0
    fi
    sleep $((i*2))
  done
  log "  ! update-role FAILED for ${name}: ${resp:-<empty>}"
  rm -f "$body_file"
  return 1
}

created=0
updated=0
skipped=0
failed=0
UPDATE_EXISTING="${UPDATE_EXISTING:-0}"  # =1 时，对已存在的 role 用 update-role 覆盖（修复乱码/继承调整）
for entry in "${ROLES[@]}"; do
  IFS='|' read -r name display desc inherits <<<"$entry"
  rc=0
  role_exists "$name" || rc=$?
  case $rc in
    0)
      if [ "$UPDATE_EXISTING" = "1" ]; then
        if update_role "$name" "$display" "$desc" "$inherits"; then
          updated=$((updated+1))
        else
          failed=$((failed+1))
        fi
      else
        log "  = exists   ${CASDOOR_ORG}/${name}"
        skipped=$((skipped+1))
      fi
      ;;
    1)
      if add_role "$name" "$display" "$desc" "$inherits"; then
        created=$((created+1))
      else
        failed=$((failed+1))
      fi
      ;;
    *)
      log "  ! skip ${name} due to get-role failure"
      failed=$((failed+1))
      ;;
  esac
done

log "done. created=${created} updated=${updated} skipped=${skipped} failed=${failed}"
[ "$failed" -eq 0 ]
