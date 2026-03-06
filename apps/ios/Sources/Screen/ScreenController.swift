<<<<<<< HEAD
import BotKit
import Observation
import SwiftUI
=======
import OpenClawKit
import Observation
import UIKit
>>>>>>> upstream/main
import WebKit

@MainActor
@Observable
final class ScreenController {
<<<<<<< HEAD
    let webView: WKWebView
    private let navigationDelegate: ScreenNavigationDelegate
    private let a2uiActionHandler: CanvasA2UIActionMessageHandler
=======
    private weak var activeWebView: WKWebView?
>>>>>>> upstream/main

    var urlString: String = ""
    var errorText: String?

<<<<<<< HEAD
    /// Callback invoked when an hanzo-bot:// deep link is tapped in the canvas
=======
    /// Callback invoked when an openclaw:// deep link is tapped in the canvas
>>>>>>> upstream/main
    var onDeepLink: ((URL) -> Void)?

    /// Callback invoked when the user clicks an A2UI action (e.g. button) inside the canvas web UI.
    var onA2UIAction: (([String: Any]) -> Void)?

    private var debugStatusEnabled: Bool = false
    private var debugStatusTitle: String?
    private var debugStatusSubtitle: String?

    init() {
<<<<<<< HEAD
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let a2uiActionHandler = CanvasA2UIActionMessageHandler()
        let userContentController = WKUserContentController()
        for name in CanvasA2UIActionMessageHandler.handlerNames {
            userContentController.add(a2uiActionHandler, name: name)
        }
        config.userContentController = userContentController
        self.navigationDelegate = ScreenNavigationDelegate()
        self.a2uiActionHandler = a2uiActionHandler
        self.webView = WKWebView(frame: .zero, configuration: config)
        // Canvas scaffold is a fully self-contained HTML page; avoid relying on transparency underlays.
        self.webView.isOpaque = true
        self.webView.backgroundColor = .black
        self.webView.scrollView.backgroundColor = .black
        self.webView.scrollView.contentInsetAdjustmentBehavior = .never
        self.webView.scrollView.contentInset = .zero
        self.webView.scrollView.scrollIndicatorInsets = .zero
        self.webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false
        self.applyScrollBehavior()
        self.webView.navigationDelegate = self.navigationDelegate
        self.navigationDelegate.controller = self
        a2uiActionHandler.controller = self
=======
>>>>>>> upstream/main
        self.reload()
    }

    func navigate(to urlString: String) {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            self.urlString = ""
            self.reload()
            return
        }
        if let url = URL(string: trimmed),
           !url.isFileURL,
           let host = url.host,
           LoopbackHost.isLoopback(host)
        {
            // Never try to load loopback URLs from a remote gateway.
            self.showDefaultCanvas()
            return
        }
        self.urlString = (trimmed == "/" ? "" : trimmed)
        self.reload()
    }

    func reload() {
<<<<<<< HEAD
        let trimmed = self.urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        self.applyScrollBehavior()
        if trimmed.isEmpty {
            guard let url = Self.canvasScaffoldURL else { return }
            self.errorText = nil
            self.webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            return
        } else {
            guard let url = URL(string: trimmed) else {
                self.errorText = "Invalid URL: \(trimmed)"
                return
            }
            self.errorText = nil
            if url.isFileURL {
                self.webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            } else {
                self.webView.load(URLRequest(url: url))
            }
=======
        self.applyScrollBehavior()
        guard let webView = self.activeWebView else { return }

        let trimmed = self.urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            guard let url = Self.canvasScaffoldURL else { return }
            self.errorText = nil
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            return
        }

        guard let url = URL(string: trimmed) else {
            self.errorText = "Invalid URL: \(trimmed)"
            return
        }
        self.errorText = nil
        if url.isFileURL {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.load(URLRequest(url: url))
>>>>>>> upstream/main
        }
    }

    func showDefaultCanvas() {
        self.urlString = ""
        self.reload()
    }

    func setDebugStatusEnabled(_ enabled: Bool) {
        self.debugStatusEnabled = enabled
        self.applyDebugStatusIfNeeded()
    }

    func updateDebugStatus(title: String?, subtitle: String?) {
        self.debugStatusTitle = title
        self.debugStatusSubtitle = subtitle
        self.applyDebugStatusIfNeeded()
    }

<<<<<<< HEAD
    fileprivate func applyDebugStatusIfNeeded() {
        let enabled = self.debugStatusEnabled
        let title = self.debugStatusTitle
        let subtitle = self.debugStatusSubtitle
        let js = """
        (() => {
          try {
            const api = globalThis.__bot;
            if (!api) return;
            if (typeof api.setDebugStatusEnabled === 'function') {
              api.setDebugStatusEnabled(\(enabled ? "true" : "false"));
            }
            if (!\(enabled ? "true" : "false")) return;
            if (typeof api.setStatus === 'function') {
              api.setStatus(\(Self.jsValue(title)), \(Self.jsValue(subtitle)));
            }
          } catch (_) {}
        })()
        """
        self.webView.evaluateJavaScript(js) { _, _ in }
=======
    func applyDebugStatusIfNeeded() {
        guard let webView = self.activeWebView else { return }
        WebViewJavaScriptSupport.applyDebugStatus(
            webView: webView,
            enabled: self.debugStatusEnabled,
            title: self.debugStatusTitle,
            subtitle: self.debugStatusSubtitle)
>>>>>>> upstream/main
    }

    func waitForA2UIReady(timeoutMs: Int) async -> Bool {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .milliseconds(timeoutMs))
        while clock.now < deadline {
            do {
                let res = try await self.eval(javaScript: """
                (() => {
                  try {
<<<<<<< HEAD
                    const host = globalThis.hanzo-botA2UI;
=======
                    const host = globalThis.openclawA2UI;
>>>>>>> upstream/main
                    return !!host && typeof host.applyMessages === 'function';
                  } catch (_) { return false; }
                })()
                """)
                let trimmed = res.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if trimmed == "true" || trimmed == "1" { return true }
            } catch {
                // ignore; page likely still loading
            }
            try? await Task.sleep(nanoseconds: 120_000_000)
        }
        return false
    }

    func eval(javaScript: String) async throws -> String {
<<<<<<< HEAD
        try await withCheckedThrowingContinuation { cont in
            self.webView.evaluateJavaScript(javaScript) { result, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                if let result {
                    cont.resume(returning: String(describing: result))
                } else {
                    cont.resume(returning: "")
                }
            }
        }
    }

    func snapshotPNGBase64(maxWidth: CGFloat? = nil) async throws -> String {
        let config = WKSnapshotConfiguration()
        if let maxWidth {
            config.snapshotWidth = NSNumber(value: Double(maxWidth))
        }
        let image: UIImage = try await withCheckedThrowingContinuation { cont in
            self.webView.takeSnapshot(with: config) { image, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                guard let image else {
                    cont.resume(throwing: NSError(domain: "Screen", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "snapshot failed",
                    ]))
                    return
                }
                cont.resume(returning: image)
            }
        }
=======
        guard let webView = self.activeWebView else {
            throw NSError(domain: "Screen", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "web view unavailable",
            ])
        }
        return try await WebViewJavaScriptSupport.evaluateToString(webView: webView, javaScript: javaScript)
    }

    func snapshotPNGBase64(maxWidth: CGFloat? = nil) async throws -> String {
        let image = try await self.snapshotImage(maxWidth: maxWidth)
>>>>>>> upstream/main
        guard let data = image.pngData() else {
            throw NSError(domain: "Screen", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "snapshot encode failed",
            ])
        }
        return data.base64EncodedString()
    }

    func snapshotBase64(
        maxWidth: CGFloat? = nil,
<<<<<<< HEAD
        format: HanzoBotCanvasSnapshotFormat,
        quality: Double? = nil) async throws -> String
    {
        let config = WKSnapshotConfiguration()
        if let maxWidth {
            config.snapshotWidth = NSNumber(value: Double(maxWidth))
        }
        let image: UIImage = try await withCheckedThrowingContinuation { cont in
            self.webView.takeSnapshot(with: config) { image, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                guard let image else {
                    cont.resume(throwing: NSError(domain: "Screen", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "snapshot failed",
                    ]))
                    return
                }
                cont.resume(returning: image)
            }
        }
=======
        format: OpenClawCanvasSnapshotFormat,
        quality: Double? = nil) async throws -> String
    {
        let image = try await self.snapshotImage(maxWidth: maxWidth)
>>>>>>> upstream/main

        let data: Data?
        switch format {
        case .png:
            data = image.pngData()
        case .jpeg:
            let q = (quality ?? 0.82).clamped(to: 0.1...1.0)
            data = image.jpegData(compressionQuality: q)
        }
        guard let data else {
            throw NSError(domain: "Screen", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "snapshot encode failed",
            ])
        }
        return data.base64EncodedString()
    }

<<<<<<< HEAD
=======
    private func snapshotImage(maxWidth: CGFloat?) async throws -> UIImage {
        let config = WKSnapshotConfiguration()
        if let maxWidth {
            config.snapshotWidth = NSNumber(value: Double(maxWidth))
        }
        guard let webView = self.activeWebView else {
            throw NSError(domain: "Screen", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "web view unavailable",
            ])
        }
        let image: UIImage = try await withCheckedThrowingContinuation { cont in
            webView.takeSnapshot(with: config) { image, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                guard let image else {
                    cont.resume(throwing: NSError(domain: "Screen", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "snapshot failed",
                    ]))
                    return
                }
                cont.resume(returning: image)
            }
        }
        return image
    }

    func attachWebView(_ webView: WKWebView) {
        self.activeWebView = webView
        self.reload()
        self.applyDebugStatusIfNeeded()
    }

    func detachWebView(_ webView: WKWebView) {
        guard self.activeWebView === webView else { return }
        self.activeWebView = nil
    }

>>>>>>> upstream/main
    private static func bundledResourceURL(
        name: String,
        ext: String,
        subdirectory: String)
        -> URL?
    {
<<<<<<< HEAD
        let bundle = BotKitResources.bundle
=======
        let bundle = OpenClawKitResources.bundle
>>>>>>> upstream/main
        return bundle.url(forResource: name, withExtension: ext, subdirectory: subdirectory)
            ?? bundle.url(forResource: name, withExtension: ext)
    }

    private static let canvasScaffoldURL: URL? = ScreenController.bundledResourceURL(
        name: "scaffold",
        ext: "html",
        subdirectory: "CanvasScaffold")

    func isTrustedCanvasUIURL(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        let std = url.standardizedFileURL
        if let expected = Self.canvasScaffoldURL,
           std == expected.standardizedFileURL
        {
            return true
        }
        return false
    }

    private func applyScrollBehavior() {
<<<<<<< HEAD
        let trimmed = self.urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowScroll = !trimmed.isEmpty
        let scrollView = self.webView.scrollView
=======
        guard let webView = self.activeWebView else { return }
        let trimmed = self.urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowScroll = !trimmed.isEmpty
        let scrollView = webView.scrollView
>>>>>>> upstream/main
        // Default canvas needs raw touch events; external pages should scroll.
        scrollView.isScrollEnabled = allowScroll
        scrollView.bounces = allowScroll
    }

    func isLocalNetworkCanvasURL(_ url: URL) -> Bool {
        LocalNetworkURLSupport.isLocalNetworkHTTPURL(url)
    }

    nonisolated static func parseA2UIActionBody(_ body: Any) -> [String: Any]? {
        if let dict = body as? [String: Any] { return dict.isEmpty ? nil : dict }
        if let str = body as? String,
           let data = str.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
            return json.isEmpty ? nil : json
        }
        if let dict = body as? [AnyHashable: Any] {
            let mapped = dict.reduce(into: [String: Any]()) { acc, pair in
                guard let key = pair.key as? String else { return }
                acc[key] = pair.value
            }
            return mapped.isEmpty ? nil : mapped
        }
        return nil
    }
}

extension Double {
    fileprivate func clamped(to range: ClosedRange<Double>) -> Double {
        if self < range.lowerBound { return range.lowerBound }
        if self > range.upperBound { return range.upperBound }
        return self
    }
}
<<<<<<< HEAD

// MARK: - Navigation Delegate

/// Handles navigation policy to intercept hanzo-bot:// deep links from canvas
@MainActor
private final class ScreenNavigationDelegate: NSObject, WKNavigationDelegate {
    weak var controller: ScreenController?

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void)
    {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Intercept hanzo-bot:// deep links.
        if url.scheme?.lowercased() == "hanzo-bot" {
            decisionHandler(.cancel)
            self.controller?.onDeepLink?(url)
            return
        }

        decisionHandler(.allow)
    }

    func webView(
        _: WKWebView,
        didFailProvisionalNavigation _: WKNavigation?,
        withError error: any Error)
    {
        self.controller?.errorText = error.localizedDescription
    }

    func webView(_: WKWebView, didFinish _: WKNavigation?) {
        self.controller?.errorText = nil
        self.controller?.applyDebugStatusIfNeeded()
    }

    func webView(_: WKWebView, didFail _: WKNavigation?, withError error: any Error) {
        self.controller?.errorText = error.localizedDescription
    }
}

private final class CanvasA2UIActionMessageHandler: NSObject, WKScriptMessageHandler {
    static let messageName = "hanzo-botCanvasA2UIAction"
    static let handlerNames = [messageName]

    weak var controller: ScreenController?

    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard Self.handlerNames.contains(message.name) else { return }
        guard let controller else { return }

        guard let url = message.webView?.url else { return }
        if url.isFileURL {
            guard controller.isTrustedCanvasUIURL(url) else { return }
        } else {
            // For security, only accept actions from local-network pages (e.g. the canvas host).
            guard controller.isLocalNetworkCanvasURL(url) else { return }
        }

        guard let body = ScreenController.parseA2UIActionBody(message.body) else { return }

        controller.onA2UIAction?(body)
    }
}
=======
>>>>>>> upstream/main
