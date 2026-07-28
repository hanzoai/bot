import Foundation
import BotProtocol

enum GatewayConnectPayload {
    static func makeClient(
        options: GatewayConnectOptions,
        displayName: String,
        platform: String) -> [String: BotProtocol.AnyCodable]
    {
        var client: [String: BotProtocol.AnyCodable] = [
            "id": BotProtocol.AnyCodable(options.clientId),
            "displayName": BotProtocol.AnyCodable(displayName),
            "version": BotProtocol.AnyCodable(
                Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"),
            "platform": BotProtocol.AnyCodable(platform),
            "mode": BotProtocol.AnyCodable(options.clientMode),
            "instanceId": BotProtocol.AnyCodable(InstanceIdentity.instanceId),
            "deviceFamily": BotProtocol.AnyCodable(InstanceIdentity.deviceFamily),
        ]
        if let model = InstanceIdentity.modelIdentifier {
            client["modelIdentifier"] = BotProtocol.AnyCodable(model)
        }
        return client
    }
}
