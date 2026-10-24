// Loaded only by explicitly offline validation commands, never the app.
const denied=()=>{throw new Error("OFFLINE_NETWORK_DENIED")};
globalThis.fetch=denied;
globalThis.WebSocket=class {constructor(){denied()}};
for(const name of ["node:http","node:https"]){
  const module=require(name);module.request=denied;module.get=denied;
}
const net=require("node:net");
net.connect=denied;net.createConnection=denied;net.Socket.prototype.connect=denied;
require("node:tls").connect=denied;
require("node:http2").connect=denied;
require("node:dgram").Socket.prototype.send=denied;
require("node:module").syncBuiltinESMExports();
