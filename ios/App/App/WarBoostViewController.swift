import Capacitor
import Security
import Foundation
import WebKit
import UIKit

@objc(WarBoostSecureStoragePlugin)
public class WarBoostSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WarBoostSecureStoragePlugin"
    public let jsName = "WarBoostSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "readSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "fr.warboost.app.session", kSecAttrAccount as String: "session"]
    }
    public override func load() {
        // Keychain may survive uninstall: a fresh installation must not resume an old account.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: "warboost.installed") {
            SecItemDelete(query as CFDictionary)
            defaults.set(true, forKey: "warboost.installed")
        }
    }
    public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url else { return true }
        if url.host == "localhost" && ["capacitor", "https"].contains(url.scheme ?? "") { return nil }
        let host = (url.host ?? "").lowercased()
        let blocked = ["stripe.com", "lastwar.com", "funfly.com"].contains { host == $0 || host.hasSuffix("." + $0) }
        if url.scheme == "https" && url.user == nil && url.password == nil && !blocked {
            UIApplication.shared.open(url)
        }
        return true
    }
    @objc func readSession(_ call: CAPPluginCall) {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": "{}"]); return }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            call.reject("Secure session unavailable"); return
        }
        call.resolve(["value": value])
    }
    @objc func writeSession(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), value.utf8.count <= 100000 else {call.reject("Invalid session"); return}
        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(attributes) { _, value in value } as CFDictionary, nil)
        }
        guard status == errSecSuccess else {call.reject("Secure session not saved"); return}
        call.resolve()
    }
    @objc func request(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme == "https", url.user == nil, url.password == nil else {
            call.reject("Network destination denied"); return
        }
        let host = url.host ?? ""
        let beta = host == "beta.warboost.fr" && url.path.hasPrefix("/api/")
        let auth = host.range(of: "^[a-z0-9-]+\\.supabase\\.(co|in)$", options: .regularExpression) != nil
            && (url.path.hasPrefix("/auth/v1/") || url.path.hasPrefix("/rest/v1/"))
        guard beta || auth else { call.reject("Network destination denied"); return }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.httpMethod = call.getString("method") ?? "GET"
        if url.path == "/api/pro" && request.httpMethod != "GET" {
            call.reject("Mobile billing disabled"); return
        }
        for (name, value) in call.getObject("headers") ?? [:] {
            if let text = value as? String {request.setValue(text, forHTTPHeaderField: name)}
        }
        if let data = call.getValue("data") {
            do {
                if let text = data as? String {request.httpBody = text.data(using: .utf8)}
                else {request.httpBody = try JSONSerialization.data(withJSONObject: data)}
            } catch {call.reject("Invalid request data"); return}
        }
        let session = URLSession(configuration: .ephemeral, delegate: WarBoostNoRedirect(), delegateQueue: nil)
        session.dataTask(with: request) { data, response, error in
            defer {session.finishTasksAndInvalidate()}
            guard error == nil, let response = response as? HTTPURLResponse else {
                call.reject("Network unavailable"); return
            }
            var headers: [String: String] = [:]
            for (name, value) in response.allHeaderFields {headers[String(describing: name).lowercased()] = String(describing: value)}
            call.resolve(["status": response.statusCode, "headers": headers,
                          "url": response.url?.absoluteString ?? raw,
                          "data": String(data: data ?? Data(), encoding: .utf8) ?? ""])
        }.resume()
    }
}

private class WarBoostNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

class WarBoostViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WarBoostSecureStoragePlugin())
    }
}
