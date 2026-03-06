<<<<<<< HEAD
import BotKit
import Network
import Testing
@testable import HanzoBot
=======
import OpenClawKit
import Network
import Testing
@testable import OpenClaw
>>>>>>> upstream/main

@Suite struct GatewayEndpointIDTests {
    @Test func stableIDForServiceDecodesAndNormalizesName() {
        let endpoint = NWEndpoint.service(
<<<<<<< HEAD
            name: "HanzoBot\\032Gateway   \\032  Node\n",
            type: "_bot-gw._tcp",
            domain: "local.",
            interface: nil)

        #expect(GatewayEndpointID.stableID(endpoint) == "_bot-gw._tcp|local.|HanzoBot Gateway Node")
=======
            name: "OpenClaw\\032Gateway   \\032  Node\n",
            type: "_openclaw-gw._tcp",
            domain: "local.",
            interface: nil)

        #expect(GatewayEndpointID.stableID(endpoint) == "_openclaw-gw._tcp|local.|OpenClaw Gateway Node")
>>>>>>> upstream/main
    }

    @Test func stableIDForNonServiceUsesEndpointDescription() {
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host("127.0.0.1"), port: 4242)
        #expect(GatewayEndpointID.stableID(endpoint) == String(describing: endpoint))
    }

    @Test func prettyDescriptionDecodesBonjourEscapes() {
        let endpoint = NWEndpoint.service(
<<<<<<< HEAD
            name: "HanzoBot\\032Gateway",
            type: "_bot-gw._tcp",
=======
            name: "OpenClaw\\032Gateway",
            type: "_openclaw-gw._tcp",
>>>>>>> upstream/main
            domain: "local.",
            interface: nil)

        let pretty = GatewayEndpointID.prettyDescription(endpoint)
        #expect(pretty == BonjourEscapes.decode(String(describing: endpoint)))
        #expect(!pretty.localizedCaseInsensitiveContains("\\032"))
    }
}
