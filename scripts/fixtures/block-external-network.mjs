// Local validation only. Never imported by the application.
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import {syncBuiltinESMExports} from "node:module";
const denied=()=>{throw new Error("external_network_forbidden_in_local_validation")};
globalThis.fetch=denied;
for(const mod of [http,https]){
  mod.request=denied;
  mod.get=denied;
}
net.connect=denied;
net.createConnection=denied;
net.Socket.prototype.connect=denied;
tls.connect=denied;
syncBuiltinESMExports();
