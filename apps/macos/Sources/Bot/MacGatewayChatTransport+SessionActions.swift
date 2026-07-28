import Foundation
import BotChatUI
import BotProtocol

extension MacGatewayChatTransport {
    func acquireNewSessionRouteLease() async -> BotChatNewSessionRouteLease? {
        guard let serverLease = await self.connection.captureServerLease() else { return nil }
        guard await self.currentOutboxGatewayMatchesConnection() else { return nil }
        let request: @Sendable (BotChatGatewayRequest) async throws -> Data = { request in
            try await self.connection.request(
                method: request.method,
                params: request.params,
                timeoutMs: request.timeoutMs,
                ifCurrentServerLease: serverLease)
        }
        return BotChatNewSessionRouteLease(
            listAgents: {
                let data = try await request(BotChatGatewayRequests.agentsList())
                let result = try JSONDecoder().decode(AgentsListResult.self, from: data)
                return BotChatAgentsListResponse(
                    defaultId: result.defaultid,
                    agents: result.agents.filter(\.isSelectableAgent).map {
                        BotChatAgentChoice(
                            id: $0.id,
                            name: $0.name,
                            workspaceGit: $0.workspacegit)
                    })
            },
            createSession: { key, label, explicitAgentID, parentSessionKey, worktree, worktreeBaseRef in
                let agentID = explicitAgentID
                    ?? BotChatSessionKey.agentID(from: key)
                    ?? parentSessionKey.flatMap { BotChatSessionKey.agentID(from: $0) }
                let createRequest = BotChatGatewayRequests.createSession(
                    key: key,
                    agentID: agentID,
                    label: label,
                    parentSessionKey: parentSessionKey,
                    worktree: worktree,
                    worktreeBaseRef: worktreeBaseRef)
                let data = try await request(createRequest)
                return try JSONDecoder().decode(BotChatCreateSessionResponse.self, from: data)
            })
    }

    func acquireSessionGroupsRouteLease() async -> BotChatSessionGroupsRouteLease? {
        guard let serverLease = await self.connection.captureServerLease() else { return nil }
        guard await self.currentOutboxGatewayMatchesConnection() else { return nil }
        let request: @Sendable (BotChatGatewayRequest) async throws -> Data = { request in
            try await self.connection.request(
                method: request.method,
                params: request.params,
                timeoutMs: request.timeoutMs,
                ifCurrentServerLease: serverLease)
        }
        return BotChatSessionGroupsRouteLease(
            listGroups: {
                let data = try await request(BotChatGatewayRequests.sessionGroupsList())
                return try JSONDecoder().decode(BotChatSessionGroupsResponse.self, from: data)
            },
            putGroups: { names in
                let data = try await request(BotChatGatewayRequests.sessionGroupsPut(names: names))
                return try JSONDecoder().decode(BotChatSessionGroupsMutationResponse.self, from: data)
            },
            renameGroup: { name, to in
                let data = try await request(BotChatGatewayRequests.sessionGroupsRename(name: name, to: to))
                return try JSONDecoder().decode(BotChatSessionGroupsMutationResponse.self, from: data)
            },
            deleteGroup: { name in
                let data = try await request(BotChatGatewayRequests.sessionGroupsDelete(name: name))
                return try JSONDecoder().decode(BotChatSessionGroupsMutationResponse.self, from: data)
            })
    }

    func acquireSessionMutationRouteLease() async -> BotChatSessionMutationRouteLease? {
        guard let serverLease = await self.connection.captureServerLease() else { return nil }
        guard await self.currentOutboxGatewayMatchesConnection() else { return nil }
        let transport = self
        return BotChatSessionMutationRouteLease(
            patchSession: { key, label, category, pinned, archived, unread in
                let target = transport.sessionTarget(for: key)
                let request = BotChatGatewayRequests.patchSession(
                    sessionKey: target.sessionKey,
                    agentID: target.agentID,
                    label: label,
                    category: category,
                    pinned: pinned,
                    archived: archived,
                    unread: unread)
                _ = try await self.connection.request(
                    method: request.method,
                    params: request.params,
                    timeoutMs: request.timeoutMs,
                    ifCurrentServerLease: serverLease)
            },
            deleteSession: { key in
                let target = transport.sessionTarget(for: key)
                let request = BotChatGatewayRequests.deleteSession(
                    sessionKey: target.sessionKey,
                    agentID: target.agentID)
                _ = try await self.connection.request(
                    method: request.method,
                    params: request.params,
                    timeoutMs: request.timeoutMs,
                    ifCurrentServerLease: serverLease)
            })
    }

    private func requestSessionAction(_ request: BotChatGatewayRequest) async throws -> Data {
        guard let serverLease = await self.connection.captureServerLease() else {
            throw BotChatTransportSendError.notDispatched
        }
        try await self.requireCurrentOutboxGateway()
        return try await self.connection.request(
            method: request.method,
            params: request.params,
            timeoutMs: request.timeoutMs,
            ifCurrentServerLease: serverLease)
    }

    func forkSession(parentKey: String) async throws -> String {
        let target = self.sessionTarget(for: parentKey)
        let request = BotChatGatewayRequests.forkSession(
            parentSessionKey: target.sessionKey,
            agentID: target.agentID)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(BotChatCreateSessionResponse.self, from: data).key
    }

    func rewindSession(
        sessionKey: String,
        entryId: String) async throws -> BotChatRewindResponse
    {
        let target = self.sessionTarget(for: sessionKey)
        let request = Self.rewindSessionRequest(
            sessionKey: target.sessionKey,
            agentID: target.agentID,
            entryId: entryId)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(BotChatRewindResponse.self, from: data)
    }

    func forkSessionAtMessage(
        sessionKey: String,
        entryId: String) async throws -> BotChatForkAtMessageResponse
    {
        let target = self.sessionTarget(for: sessionKey)
        let request = Self.forkSessionAtMessageRequest(
            sessionKey: target.sessionKey,
            agentID: target.agentID,
            entryId: entryId)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(BotChatForkAtMessageResponse.self, from: data)
    }

    func listSessionBranches(
        sessionKey: String,
        agentID: String?) async throws -> BotChatSessionBranchesResponse
    {
        let target = self.sessionTarget(for: sessionKey, overrideAgentID: agentID)
        let request = BotChatGatewayRequests.listSessionBranches(
            sessionKey: target.sessionKey,
            agentID: target.agentID)
        let data = try await self.requestSessionAction(request)
        return try JSONDecoder().decode(BotChatSessionBranchesResponse.self, from: data)
    }

    func switchSessionBranch(sessionKey: String, agentID: String?, leafEntryId: String) async throws {
        let target = self.sessionTarget(for: sessionKey)
        let request = BotChatGatewayRequests.switchSessionBranch(
            sessionKey: target.sessionKey,
            agentID: agentID ?? target.agentID,
            leafEntryId: leafEntryId)
        _ = try await self.requestSessionAction(request)
    }

    static func rewindSessionRequest(
        sessionKey: String,
        agentID: String?,
        entryId: String) -> BotChatGatewayRequest
    {
        BotChatGatewayRequests.rewindSession(
            sessionKey: sessionKey,
            agentID: agentID,
            entryId: entryId)
    }

    static func forkSessionAtMessageRequest(
        sessionKey: String,
        agentID: String?,
        entryId: String) -> BotChatGatewayRequest
    {
        BotChatGatewayRequests.forkAtMessage(
            sessionKey: sessionKey,
            agentID: agentID,
            entryId: entryId)
    }
}
