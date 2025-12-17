// Function mode
return function(conf, ctx)
  local core = require("apisix.core")
  local payload = ctx.jwt_auth_payload
  local header_value = ""

  if payload then
    local ok, res = pcall(require, "cjson")
    if ok then
        header_value = res.encode(payload)
        ngx.log(ngx.NOTICE, "JWT Claims (JSON) set to X-Auth-User.")
    else
        ngx.log(ngx.ERR, "Error requiring cjson. Cannot serialize JWT payload. Setting X-Auth-User to empty string.")
    end
  else
    ngx.log(ngx.NOTICE, "JWT Payload not found in context. Setting X-Auth-User to empty string.")
  end

  core.request.set_header(ctx, "x-auth-user", header_value)
end

// String mode
"return function(conf, ctx)\n  local core = require(\"apisix.core\")\n  local payload = ctx.jwt_auth_payload\n  local header_value = \"\"\n\n  if payload then\n    local ok, res = pcall(require, \"cjson\")\n    if ok then\n        header_value = res.encode(payload)\n        ngx.log(ngx.NOTICE, \"JWT Claims (JSON) set to X-Auth-User.\")\n    else\n        ngx.log(ngx.ERR, \"Error requiring cjson. Cannot serialize JWT payload. Setting X-Auth-User to empty string.\")\n    end\n  else\n    ngx.log(ngx.NOTICE, \"JWT Payload not found in context. Setting X-Auth-User to empty string.\")\n  end\n\n  core.request.set_header(ctx, \"x-auth-user\", header_value)\nend"