import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { SomniaMarketsWebSocketConstructor } from "@somnia-chain/markets-sdk";
/** Use the SDK's supported constructor seam when a Node host requires CONNECT proxying. */
export function rpcSocketConstructor():
  SomniaMarketsWebSocketConstructor | undefined {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy) return undefined;
  class ProxiedSocket extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { agent: new HttpsProxyAgent(proxy!) });
      this.on("error", () => {});
    }
    override close(code?: number, reason?: string | Buffer) {
      if (this.readyState === WebSocket.CONNECTING) {
        this.terminate();
        return;
      }
      super.close(code, reason);
    }
  }
  return ProxiedSocket as unknown as SomniaMarketsWebSocketConstructor;
}
