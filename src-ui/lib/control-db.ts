import { createFeltDB, type Collection, type StateFirstDB } from "@feltdb/core";
import { invoke } from "./tauri.ts";
import {runtimeWorkTransition,type RuntimeWorkTransition} from "./work-lifecycle.ts";
export type ControlDataTopology = { mode: "local" | "server"; serverUrl?: string; hasCredential: boolean; token?: string };
export type ControlBackup = { format: "control-feltdb-snapshot"; version: 2; exportedAt: string; topology: "local" | "server"; collections: Record<string, unknown[]> };
export type ControlProject = {
    id: string;
    name: string;
    path: string;
    description?: string;
    runtime?: string;
    createdAt: number;
    updatedAt: number;
};
export type ControlAgent = {
    id: string;
    name: string;
    description: string;
    instructions: string;
    capabilities: string[];
    status: "active" | "disabled";
    runtime?: string;
    timeoutMinutes: number;
    executionPolicy: {
        filesystem: "read-only" | "workspace-write";
        shell: boolean;
        network: boolean;
    };
    createdAt: number;
    updatedAt: number;
};
/** Legacy execution-profile shape retained for migration compatibility. */
export type ControlIntelligence = ControlAgent & { provider?: string; model?: string };
export type ControlSkill = { id:string; name:string; description:string; instructions:string; tags:string[]; status:"active"|"disabled"; createdAt:number; updatedAt:number };
export type ControlCapability = { id:string; name:string; description:string; risk:"low"|"medium"|"high"; approval:"never"|"high-risk"|"always"; enabled:boolean; createdAt:number; updatedAt:number };
export type ControlOrganization = { id:string; name:string; topology:"solo"|"managed"|"self-hosted"|"hybrid"; createdAt:number; updatedAt:number };
export type ControlMembership = { id:string; organizationId:string; participantId:string; role:"owner"|"admin"|"member"|"viewer"; createdAt:number; updatedAt:number };
export type ControlClaim = { id:string; projectId:string; workId:string; statement:string; status:"proposed"|"supported"|"contradicted"|"unknown"; evidenceIds:string[]; createdAt:number; updatedAt:number };
export type ControlRepository = { id:string; projectId:string; rootPath:string; structureSummary:string; components:string[]; environments:string[]; deployTargets:string[]; dependencies:string[]; conventions:string[]; lastScannedAt:number; createdAt:number; updatedAt:number };
export type ControlOperationalCommand = { id:string; projectId:string; repositoryId:string; name:string; purpose:"build"|"test"|"lint"|"run"|"deploy"|"other"; command:string; source:string; lastVerifiedAt?:number; verifiedBy?:string; lastResult?:"passed"|"failed"|"unknown"; runId?:string; createdAt:number; updatedAt:number };
export type ControlDocumentationRecord = { id:string; projectId:string; repositoryId:string; path:string; fingerprint:string; status:"current"|"possibly-stale"|"missing"; checkedAt:number; createdAt:number; updatedAt:number };
export type ControlParticipant = {
    id: string;
    type: "human" | "agent" | "system";
    name: string;
    roles: string[];
    capabilities: string[];
    status: "active" | "disabled";
    createdAt: number;
    updatedAt: number;
};
export const LOCAL_PARTICIPANT_ID = "local-user";
export type ControlWork = {
    id: string;
    projectId: string;
    title: string;
    intent: string;
    kind: "task" | "feature" | "bug" | "investigation" | "review" | "release" | "maintenance";
    status: "captured" | "active" | "awaiting-input" | "review" | "completed" | "failed" | "blocked" | "reopened" | "cancelled";
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
};
export type ControlTask = {
    id: string;
    workId: string;
    projectId: string;
    title: string;
    description: string;
    status: "not-started" | "in-progress" | "awaiting-input" | "review" | "done" | "failed" | "stopped" | "archived";
    assignedTo?: string;
    priority: "critical" | "high" | "medium" | "low";
    urgency: "urgent" | "normal";
    tags: string[];
    blockedBy: string[];
    acceptanceCriteria: string[];
    feedback: Array<{
        id: string;
        author: string;
        content: string;
        createdAt: number;
    }>;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    archivedFrom?: Exclude<ControlTask["status"], "archived">;
    order?: number;
    modelPreference?: "auto" | "local" | "frontier";
};
export type ControlConversation = {
    id: string;
    projectId: string;
    taskId?: string;
    workId?: string;
    agentId: string;
    intelligenceId?: string;
    title: string;
    createdAt: number;
    updatedAt: number;
};
export type ControlMessage = {
    id: string;
    conversationId: string;
    senderId: string;
    role: "user" | "assistant" | "system";
    type: "message" | "question" | "report" | "feedback" | "approval";
    content: string;
    deliveryStatus?: "pending" | "delivered" | "failed";
    error?: string;
    runId?: string;
    createdAt: number;
};
export type ControlDecision = {
    id: string;
    projectId: string;
    taskId?: string;
    runId?: string;
    workId?: string;
    requestedBy: string;
    question: string;
    context: string;
    options: string[];
    status: "pending" | "answered";
    answer?: string;
    createdAt: number;
    answeredAt?: number;
};
export type ControlInboxItem = {
    id: string;
    projectId: string;
    workId: string;
    taskId?: string;
    conversationId?: string;
    fromParticipantId: string;
    toParticipantId: string;
    type: "assignment" | "handoff" | "question" | "review" | "evidence-request" | "approval" | "escalation" | "feedback";
    title: string;
    body?: string;
    status: "open" | "acknowledged" | "acted" | "dismissed";
    createdAt: number;
    updatedAt: number;
    actedAt?: number;
};
export type ControlRun = {
    id: string;
    taskId?: string;
    projectId: string;
    workId: string;
    kind?: "task" | "conversation";
    conversationId?: string;
    requestMessageId?: string;
    agentId: string;
    intelligenceId?: string;
    skillIds?: string[];
    capabilityIds?: string[];
    runtime: string;
    routingTier?: "local" | "frontier";
    routingReason?: string;
    status: "queued" | "starting" | "running" | "awaiting-input" | "completed" | "failed" | "stopped" | "interrupted";
    heartbeatAt?: number;
    pid?: number;
    processStartedAt?: number;
    startedAt: number;
    completedAt?: number;
    summary?: string;
    error?: string;
    exitCode?: number;
};
export type ControlRunEvent = {
    id: string;
    runId: string;
    projectId: string;
    taskId?: string;
    workId: string;
    type: "output" | "completed" | "failed" | "decision_requested" | "decision_answered" | "handoff" | "interrupted";
    content?: string;
    exitCode?: number;
    createdAt: number;
};
export type ControlChangeSet = {
    id: string;
    runId: string;
    projectId: string;
    taskId: string;
    workId: string;
    branch: string;
    baselineFiles: string[];
    files: Array<{ path: string; status: string; staged: boolean; preExisting: boolean }>;
    capturedAt?: number;
    createdAt: number;
};
export type ControlTestResult = {
    id: string;
    runId: string;
    projectId: string;
    taskId: string;
    workId: string;
    command: string;
    status: "passed" | "failed" | "skipped";
    summary?: string;
    provenance: "agent-reported";
    createdAt: number;
};
export type ControlActivity = {
    id: string;
    projectId?: string;
    taskId?: string;
    runId?: string;
    workId?: string;
    type: string;
    actor: string;
    summary: string;
    details?: string;
    createdAt: number;
};
export type ControlEvidence = {
    id: string;
    projectId: string;
    workId: string;
    taskId?: string;
    runId?: string;
    kind: "run_output" | "test" | "build" | "review" | "source";
    summary: string;
    result: "passed" | "failed" | "unknown";
    provenance: string;
    createdAt: number;
};
export type ControlOutcome = {
    id: string;
    projectId: string;
    workId: string;
    taskId?: string;
    status: "passed" | "failed" | "partially_verified" | "blocked" | "reopened" | "cancelled" | "unknown";
    summary: string;
    evidenceIds: string[];
    createdAt: number;
};
export type ControlInvestigation = {
    id: string;
    projectId: string;
    workId: string;
    question: string;
    hypotheses: string[];
    sources: string[];
    contradictions: string[];
    gaps: string[];
    conclusion?: string;
    status: "open" | "concluded" | "blocked";
    createdAt: number;
    updatedAt: number;
};
export type ControlTerminal = {
    id: string;
    projectId: string;
    name: string;
    type: "shell" | "test" | "agent";
    cwd: string;
    history: string[];
    isActive?: boolean;
    createdAt: number;
    updatedAt: number;
};
export type ControlMetadata = {
    id: string;
    schemaVersion: number;
    integrityRepairs?: number;
    integrityIssues?: number;
    integrityCheckedAt?: number;
    createdAt: number;
    updatedAt: number;
};
export type ControlWorkspaceSettings = {
    id: string;
    currentParticipantId: string;
    activeProjectId?: string;
    openFilesByProject: Record<string, string[]>;
    activeFileByProject: Record<string, string | undefined>;
    layout: {
        sidebarWidth: number;
        agentPanelWidth: number;
        terminalHeight: number;
    };
    createdAt: number;
    updatedAt: number;
};
export type ControlDraft = {
    id: string;
    projectId: string;
    path: string;
    content: string;
    updatedAt: number;
};
export class ControlDatabase {
    readonly db: StateFirstDB;
    readonly projects: Collection<ControlProject>;
    readonly works: Collection<ControlWork>;
    readonly agents: Collection<ControlAgent>;
    readonly intelligence: Collection<ControlIntelligence>;
    readonly skills: Collection<ControlSkill>;
    readonly capabilities: Collection<ControlCapability>;
    readonly organizations: Collection<ControlOrganization>;
    readonly memberships: Collection<ControlMembership>;
    readonly claims: Collection<ControlClaim>;
    readonly repositories: Collection<ControlRepository>;
    readonly operationalCommands: Collection<ControlOperationalCommand>;
    readonly documentation: Collection<ControlDocumentationRecord>;
    readonly participants: Collection<ControlParticipant>;
    readonly tasks: Collection<ControlTask>;
    readonly conversations: Collection<ControlConversation>;
    readonly messages: Collection<ControlMessage>;
    readonly decisions: Collection<ControlDecision>;
    readonly inboxItems: Collection<ControlInboxItem>;
    readonly runs: Collection<ControlRun>;
    readonly runEvents: Collection<ControlRunEvent>;
    readonly changeSets: Collection<ControlChangeSet>;
    readonly testResults: Collection<ControlTestResult>;
    readonly activity: Collection<ControlActivity>;
    readonly evidence: Collection<ControlEvidence>;
    readonly outcomes: Collection<ControlOutcome>;
    readonly investigations: Collection<ControlInvestigation>;
    readonly terminals: Collection<ControlTerminal>;
    readonly metadata: Collection<ControlMetadata>;
    readonly settings: Collection<ControlWorkspaceSettings>;
    readonly drafts: Collection<ControlDraft>;
    readonly topology: ControlDataTopology;
    constructor(topology: ControlDataTopology = { mode: "local", hasCredential: false }) {
        this.topology = topology;
        this.db = topology.mode === "server" && topology.serverUrl && topology.token
            ? createFeltDB({ namespace: "control-desktop", server: { url: topology.serverUrl, token: topology.token } })
            : createFeltDB({ namespace: "control-desktop", browser: true });
        this.projects = this.db.collection("control_projects");
        this.works = this.db.collection("control_work");
        this.agents = this.db.collection("control_agents");
        this.intelligence = this.db.collection("control_intelligence");
        this.skills = this.db.collection("control_skills");
        this.capabilities = this.db.collection("control_capabilities");
        this.organizations = this.db.collection("control_organizations");
        this.memberships = this.db.collection("control_memberships");
        this.claims = this.db.collection("control_claims");
        this.repositories = this.db.collection("control_repositories");
        this.operationalCommands = this.db.collection("control_operational_commands");
        this.documentation = this.db.collection("control_documentation");
        this.participants = this.db.collection("control_participants");
        this.tasks = this.db.collection("control_tasks");
        this.conversations = this.db.collection("control_conversations");
        this.messages = this.db.collection("control_messages");
        this.decisions = this.db.collection("control_decisions");
        this.inboxItems = this.db.collection("control_inbox_items");
        this.runs = this.db.collection("control_runs");
        this.runEvents = this.db.collection("control_run_events");
        this.changeSets = this.db.collection("control_change_sets");
        this.testResults = this.db.collection("control_test_results");
        this.activity = this.db.collection("control_activity");
        this.evidence = this.db.collection("control_evidence");
        this.outcomes = this.db.collection("control_outcomes");
        this.investigations = this.db.collection("control_investigations");
        this.terminals = this.db.collection("control_terminals");
        this.metadata = this.db.collection("control_metadata");
        this.settings = this.db.collection("control_settings");
        this.drafts = this.db.collection("control_drafts");
        this.tasks.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
        this.works.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
        this.tasks.createIndex({ name: "status_idx", type: "hash", field: "status" });
        this.messages.createIndex({ name: "conversation_idx", type: "hash", field: "conversationId" });
        this.runs.createIndex({ name: "task_idx", type: "hash", field: "taskId" });
        this.runEvents.createIndex({ name: "run_idx", type: "hash", field: "runId" });
        this.changeSets.createIndex({ name: "run_idx", type: "hash", field: "runId" });
        this.testResults.createIndex({ name: "run_idx", type: "hash", field: "runId" });
        this.inboxItems.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
        this.inboxItems.createIndex({ name: "recipient_idx", type: "hash", field: "toParticipantId" });
        this.evidence.createIndex({ name: "work_idx", type: "hash", field: "workId" });
        this.outcomes.createIndex({ name: "work_idx", type: "hash", field: "workId" });
        this.investigations.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
        this.claims.createIndex({ name: "work_idx", type: "hash", field: "workId" });
        this.repositories.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
        this.operationalCommands.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
        this.documentation.createIndex({ name: "project_idx", type: "hash", field: "projectId" });
    }
    async initialize(): Promise<void> {
        const runtime = this.db.runtime();
        if (!runtime.persistent || !runtime.durable || !["indexeddb", "remote"].includes(runtime.storage)) {
            throw new Error(`Control requires durable FeltDB IndexedDB storage; received ${runtime.storage}`);
        }
        await this.migrateLegacyNamespace();
        const timestamp = Date.now();
        if ((await this.metadata.count()) === 0) {
            await this.metadata.insert({ id: "database", schemaVersion: 16, createdAt: timestamp, updatedAt: timestamp }, "database");
        }
        if ((await this.settings.count()) === 0) {
            await this.settings.insert({ id: "workspace", currentParticipantId: LOCAL_PARTICIPANT_ID, openFilesByProject: {}, activeFileByProject: {}, layout: { sidebarWidth: 250, agentPanelWidth: 280, terminalHeight: 200 }, createdAt: timestamp, updatedAt: timestamp }, "workspace");
        }
        if ((await this.agents.count()) === 0) {
            for (const agent of DEFAULT_AGENTS) {
                await this.agents.insert({ ...agent, createdAt: timestamp, updatedAt: timestamp }, agent.id);
            }
        }
        const metadata = await this.metadata.get("database");
        if ((metadata?.schemaVersion || 1) < 2) {
            for (const task of await this.tasks.all()) {
                const existingWorkId = (task as ControlTask & {
                    workId?: string;
                }).workId;
                if (existingWorkId)
                    continue;
                const workId = createId("work");
                await this.works.insert({ id: workId, projectId: task.projectId, title: task.title, intent: task.description, kind: "task", status: task.status === "done" ? "completed" : task.status === "review" ? "review" : task.status === "failed" ? "failed" : "captured", createdAt: task.createdAt, updatedAt: task.updatedAt, completedAt: task.completedAt }, workId);
                await this.tasks.update(task.id, { workId });
            }
            const migratedTasks = await this.tasks.all(), workForTask = new Map(migratedTasks.map(task => [task.id, task.workId]));
            for (const run of await this.runs.all()) {
                const workId = run.taskId ? workForTask.get(run.taskId) : undefined;
                if (workId)
                    await this.runs.update(run.id, { workId });
            }
            for (const event of await this.runEvents.all()) {
                const workId = event.taskId ? workForTask.get(event.taskId) : undefined;
                if (workId)
                    await this.runEvents.update(event.id, { workId });
            }
            for (const conversation of await this.conversations.all()) {
                const workId = conversation.taskId ? workForTask.get(conversation.taskId) : undefined;
                if (workId)
                    await this.conversations.update(conversation.id, { workId });
            }
            for (const decision of await this.decisions.all()) {
                const workId = decision.taskId ? workForTask.get(decision.taskId) : undefined;
                if (workId)
                    await this.decisions.update(decision.id, { workId });
            }
            for (const event of await this.activity.all()) {
                const workId = event.taskId ? workForTask.get(event.taskId) : undefined;
                if (workId)
                    await this.activity.update(event.id, { workId });
            }
            await this.metadata.update("database", { schemaVersion: 2, updatedAt: timestamp });
        }
        const migratedMetadata = await this.metadata.get("database");
        if ((migratedMetadata?.schemaVersion || 1) < 3)
            await this.metadata.update("database", { schemaVersion: 3, updatedAt: timestamp });
        const currentMetadata = await this.metadata.get("database");
        if ((currentMetadata?.schemaVersion || 1) < 4)
            await this.metadata.update("database", { schemaVersion: 4, updatedAt: timestamp });
        const identityMetadata = await this.metadata.get("database");
        if ((identityMetadata?.schemaVersion || 1) < 5) {
            if (!(await this.participants.exists(LOCAL_PARTICIPANT_ID)))
                await this.participants.insert({ id: LOCAL_PARTICIPANT_ID, type: "human", name: "Local developer", roles: ["owner", "developer", "reviewer"], capabilities: ["assign", "execute", "review", "approve"], status: "active", createdAt: timestamp, updatedAt: timestamp }, LOCAL_PARTICIPANT_ID);
            const settings = await this.settings.get("workspace");
            if (settings)
                await this.settings.update("workspace", { currentParticipantId: LOCAL_PARTICIPANT_ID, updatedAt: timestamp });
            for (const agent of await this.agents.all()) {
                if (!(agent as ControlAgent).executionPolicy)
                    await this.agents.update(agent.id, { executionPolicy: { filesystem: "workspace-write", shell: true, network: false } });
                if (!(await this.participants.exists(agent.id)))
                    await this.participants.insert({ id: agent.id, type: "agent", name: agent.name, roles: ["agent"], capabilities: agent.capabilities, status: agent.status, createdAt: agent.createdAt, updatedAt: timestamp }, agent.id);
            }
            for (const message of await this.messages.all())
                if (message.senderId === "me")
                    await this.messages.update(message.id, { senderId: LOCAL_PARTICIPANT_ID });
            for (const item of await this.inboxItems.all()) {
                const changes: Partial<ControlInboxItem> = {};
                if (item.fromParticipantId === "me")
                    changes.fromParticipantId = LOCAL_PARTICIPANT_ID;
                if (item.toParticipantId === "me")
                    changes.toParticipantId = LOCAL_PARTICIPANT_ID;
                if (Object.keys(changes).length)
                    await this.inboxItems.update(item.id, changes);
            }
            for (const event of await this.activity.all())
                if (event.actor === "me")
                    await this.activity.update(event.id, { actor: LOCAL_PARTICIPANT_ID });
            for (const task of await this.tasks.all()) {
                const feedback = task.feedback.map(item => item.author === "me" ? { ...item, author: LOCAL_PARTICIPANT_ID } : item);
                if (feedback.some((item, index) => item.author !== task.feedback[index].author))
                    await this.tasks.update(task.id, { feedback });
            }
            await this.metadata.update("database", { schemaVersion: 5, updatedAt: timestamp });
        }
        if (!(await this.participants.exists(LOCAL_PARTICIPANT_ID)))
            await this.participants.insert({ id: LOCAL_PARTICIPANT_ID, type: "human", name: "Local developer", roles: ["owner", "developer", "reviewer"], capabilities: ["assign", "execute", "review", "approve"], status: "active", createdAt: timestamp, updatedAt: timestamp }, LOCAL_PARTICIPANT_ID);
        for (const agent of await this.agents.all())
            {if(!agent.timeoutMinutes)await this.agents.update(agent.id,{timeoutMinutes:60,updatedAt:timestamp});if (!(await this.participants.exists(agent.id)))
                await this.participants.insert({ id: agent.id, type: "agent", name: agent.name, roles: ["agent"], capabilities: agent.capabilities, status: agent.status, createdAt: agent.createdAt, updatedAt: timestamp }, agent.id);
            }
        const topologyMetadata=await this.metadata.get("database");if((topologyMetadata?.schemaVersion||1)<6)await this.metadata.update("database",{schemaVersion:6,updatedAt:timestamp});
        const artifactMetadata=await this.metadata.get("database");if((artifactMetadata?.schemaVersion||1)<7)await this.metadata.update("database",{schemaVersion:7,updatedAt:timestamp});
        const conversationMetadata=await this.metadata.get("database");if((conversationMetadata?.schemaVersion||1)<8)await this.metadata.update("database",{schemaVersion:8,updatedAt:timestamp});
        const terminalMetadata=await this.metadata.get("database");if((terminalMetadata?.schemaVersion||1)<9)await this.metadata.update("database",{schemaVersion:9,updatedAt:timestamp});
        const timeoutMetadata=await this.metadata.get("database");if((timeoutMetadata?.schemaVersion||1)<10)await this.metadata.update("database",{schemaVersion:10,updatedAt:timestamp});
        const processIdentityMetadata=await this.metadata.get("database");if((processIdentityMetadata?.schemaVersion||1)<11)await this.metadata.update("database",{schemaVersion:11,updatedAt:timestamp});
        const conversationRunMetadata=await this.metadata.get("database");
        if((conversationRunMetadata?.schemaVersion||1)<12){for(const conversation of await this.conversations.all())if(!conversation.workId){const workId=createId("work");await this.works.insert({id:workId,projectId:conversation.projectId,title:conversation.title,intent:`Conversation: ${conversation.title}`,kind:"investigation",status:"active",createdAt:conversation.createdAt,updatedAt:timestamp},workId);await this.conversations.update(conversation.id,{workId});}await this.metadata.update("database",{schemaVersion:12,updatedAt:timestamp});}
        const integrityMetadata=await this.metadata.get("database");if((integrityMetadata?.schemaVersion||1)<13)await this.metadata.update("database",{schemaVersion:13,updatedAt:timestamp});
        const canonicalMetadata=await this.metadata.get("database");
        if((canonicalMetadata?.schemaVersion||1)<14){
            for(const agent of await this.agents.all())if(!(await this.intelligence.exists(agent.id)))await this.intelligence.insert({...agent,provider:"auto"},agent.id);
            if(!(await this.intelligence.exists("control-intelligence"))){const base={...DEFAULT_AGENTS[0],id:"control-intelligence",name:"Control Intelligence",description:"Control's automatic provider-independent intelligence for everyday work.",createdAt:timestamp,updatedAt:timestamp,provider:"auto"};await this.intelligence.insert(base,base.id);if(!(await this.agents.exists(base.id)))await this.agents.insert(base,base.id);if(!(await this.participants.exists(base.id)))await this.participants.insert({id:base.id,type:"system",name:base.name,roles:["intelligence"],capabilities:base.capabilities,status:"active",createdAt:timestamp,updatedAt:timestamp},base.id);}
            if(!(await this.skills.exists("software-development")))await this.skills.insert({id:"software-development",name:"Software development",description:"Inspect, implement, test, and report software changes.",instructions:"Follow repository guidance and return evidence-backed results.",tags:["code","test","review"],status:"active",createdAt:timestamp,updatedAt:timestamp},"software-development");
            for(const capability of DEFAULT_CAPABILITIES)if(!(await this.capabilities.exists(capability.id)))await this.capabilities.insert({...capability,createdAt:timestamp,updatedAt:timestamp},capability.id);
            if(!(await this.organizations.exists("local")))await this.organizations.insert({id:"local",name:"Local workspace",topology:this.topology.mode==="local"?"solo":"managed",createdAt:timestamp,updatedAt:timestamp},"local");
            if(!(await this.memberships.exists("local-owner")))await this.memberships.insert({id:"local-owner",organizationId:"local",participantId:LOCAL_PARTICIPANT_ID,role:"owner",createdAt:timestamp,updatedAt:timestamp},"local-owner");
            for(const conversation of await this.conversations.all())if(!conversation.intelligenceId)await this.conversations.update(conversation.id,{intelligenceId:conversation.agentId});
            for(const run of await this.runs.all())if(!run.intelligenceId)await this.runs.update(run.id,{intelligenceId:run.agentId,skillIds:[],capabilityIds:[],heartbeatAt:run.completedAt||run.startedAt});
            await this.metadata.update("database",{schemaVersion:14,updatedAt:timestamp});
        }
        const dailyDriverMetadata=await this.metadata.get("database");
        if((dailyDriverMetadata?.schemaVersion||1)<15){
            const executionPolicy={filesystem:"workspace-write" as const,shell:true,network:true};
            for(const profile of await this.intelligence.all())if(!profile.runtime&&profile.executionPolicy.shell&&!profile.executionPolicy.network)await this.intelligence.update(profile.id,{executionPolicy,updatedAt:timestamp});
            for(const profile of await this.agents.all())if(!profile.runtime&&profile.executionPolicy.shell&&!profile.executionPolicy.network)await this.agents.update(profile.id,{executionPolicy,updatedAt:timestamp});
            await this.metadata.update("database",{schemaVersion:15,updatedAt:timestamp});
        }
        const compatibleProfilesMetadata=await this.metadata.get("database");
        if((compatibleProfilesMetadata?.schemaVersion||1)<16){
            const executionPolicy={filesystem:"workspace-write" as const,shell:true,network:true};
            for(const profile of await this.intelligence.all())if(!profile.runtime&&profile.executionPolicy.shell&&!profile.executionPolicy.network)await this.intelligence.update(profile.id,{executionPolicy,updatedAt:timestamp});
            for(const profile of await this.agents.all())if(!profile.runtime&&profile.executionPolicy.shell&&!profile.executionPolicy.network)await this.agents.update(profile.id,{executionPolicy,updatedAt:timestamp});
            await this.metadata.update("database",{schemaVersion:16,updatedAt:timestamp});
        }
        const integrity=await this.reconcileCanonicalGraph();
        await this.metadata.update("database",{integrityRepairs:integrity.repairs,integrityIssues:integrity.issues,integrityCheckedAt:Date.now(),updatedAt:Date.now()});
    }
    private async migrateLegacyNamespace():Promise<void>{
        if(await this.metadata.count())return;
        const legacyMetadata=this.db.collection<ControlMetadata>("control:metadata");if(!(await legacyMetadata.count()))return;
        type RecordWithId={id:string};
        const pairs:Array<[Collection<RecordWithId>,Collection<RecordWithId>]>=[
            [this.db.collection("control:projects"),this.projects],[this.db.collection("control:work"),this.works],[this.db.collection("control:agents"),this.agents],[this.db.collection("control:participants"),this.participants],[this.db.collection("control:tasks"),this.tasks],[this.db.collection("control:conversations"),this.conversations],[this.db.collection("control:messages"),this.messages],[this.db.collection("control:decisions"),this.decisions],[this.db.collection("control:inbox-items"),this.inboxItems],[this.db.collection("control:runs"),this.runs],[this.db.collection("control:run-events"),this.runEvents],[this.db.collection("control:activity"),this.activity],[this.db.collection("control:evidence"),this.evidence],[this.db.collection("control:outcomes"),this.outcomes],[this.db.collection("control:investigations"),this.investigations],[this.db.collection("control:terminals"),this.terminals],[legacyMetadata,this.metadata],[this.db.collection("control:settings"),this.settings],[this.db.collection("control:drafts"),this.drafts],
        ] as Array<[Collection<RecordWithId>,Collection<RecordWithId>]>;
        const migrated:Array<[Collection<RecordWithId>,RecordWithId[]]>=[];
        for(const[source,target]of pairs){const records=await source.all();for(const record of records){if(await target.exists(record.id))await target.update(record.id,record);else await target.insert(record,record.id);}if((await target.count())<records.length)throw new Error("FeltDB namespace migration verification failed");migrated.push([source,records]);}
        for(const[source,records]of migrated)for(const record of records)await source.delete(record.id);
    }
    async exportSnapshot(): Promise<ControlBackup> {
        const collections: Record<string, unknown[]> = {
            projects: await this.projects.all(), works: await this.works.all(), agents: await this.agents.all(), intelligence:await this.intelligence.all(), skills:await this.skills.all(), capabilities:await this.capabilities.all(), organizations:await this.organizations.all(), memberships:await this.memberships.all(), claims:await this.claims.all(), repositories:await this.repositories.all(), operationalCommands:await this.operationalCommands.all(), documentation:await this.documentation.all(), participants: await this.participants.all(), tasks: await this.tasks.all(), conversations: await this.conversations.all(), messages: await this.messages.all(), decisions: await this.decisions.all(), inboxItems: await this.inboxItems.all(), runs: await this.runs.all(), runEvents: await this.runEvents.all(), changeSets:await this.changeSets.all(),testResults:await this.testResults.all(), activity: await this.activity.all(), evidence: await this.evidence.all(), outcomes: await this.outcomes.all(), investigations: await this.investigations.all(), terminals: await this.terminals.all(), metadata: await this.metadata.all(), settings: await this.settings.all(), drafts: await this.drafts.all(),
        };
        return { format: "control-feltdb-snapshot", version: 2, exportedAt: new Date().toISOString(), topology: this.topology.mode, collections };
    }
    async importSnapshot(backup: ControlBackup): Promise<{ applied: number }> {
        if (backup.format !== "control-feltdb-snapshot" || backup.version !== 2 || !backup.collections)
            throw new Error("Not a supported Control FeltDB snapshot");
        let applied = 0;
        const merge = async <T extends { id: string }>(collection: Collection<T>, values: unknown[] | undefined) => {
            for (const value of values || []) {
                if (!value || typeof value !== "object" || typeof (value as { id?: unknown }).id !== "string")
                    throw new Error("Backup contains a record without durable identity");
                const record = value as T;
                if (await collection.exists(record.id))
                    await collection.update(record.id, record);
                else
                    await collection.insert(record, record.id);
                applied++;
            }
        };
        await merge(this.projects, backup.collections.projects); await merge(this.works, backup.collections.works); await merge(this.agents, backup.collections.agents); await merge(this.intelligence,backup.collections.intelligence); await merge(this.skills,backup.collections.skills); await merge(this.capabilities,backup.collections.capabilities); await merge(this.organizations,backup.collections.organizations); await merge(this.memberships,backup.collections.memberships); await merge(this.claims,backup.collections.claims); await merge(this.repositories,backup.collections.repositories); await merge(this.operationalCommands,backup.collections.operationalCommands); await merge(this.documentation,backup.collections.documentation); await merge(this.participants, backup.collections.participants); await merge(this.tasks, backup.collections.tasks); await merge(this.conversations, backup.collections.conversations); await merge(this.messages, backup.collections.messages); await merge(this.decisions, backup.collections.decisions); await merge(this.inboxItems, backup.collections.inboxItems); await merge(this.runs, backup.collections.runs); await merge(this.runEvents, backup.collections.runEvents); await merge(this.changeSets,backup.collections.changeSets);await merge(this.testResults,backup.collections.testResults); await merge(this.activity, backup.collections.activity); await merge(this.evidence, backup.collections.evidence); await merge(this.outcomes, backup.collections.outcomes); await merge(this.investigations, backup.collections.investigations); await merge(this.terminals, backup.collections.terminals); await merge(this.metadata, backup.collections.metadata); await merge(this.settings, backup.collections.settings); await merge(this.drafts, backup.collections.drafts);
        return { applied };
    }
    async removeProjectGraph(projectId:string):Promise<{deleted:number}>{
        const activeRuns=(await this.runs.find({projectId})).filter(run=>run.status==="queued"||run.status==="starting"||run.status==="running");
        if(activeRuns.length)throw new Error("Stop active Intelligence Runs before removing this project");
        let deleted=0;
        for(const terminal of await this.terminals.find({projectId})){await invoke("cmd_terminal_session_close",{sessionId:terminal.id});await this.terminals.delete(terminal.id);deleted++;}
        for(const conversation of await this.conversations.find({projectId})){for(const message of await this.messages.find({conversationId:conversation.id})){await this.messages.delete(message.id);deleted++;}await this.conversations.delete(conversation.id);deleted++;}
        const collections=[this.tasks,this.investigations,this.decisions,this.inboxItems,this.runs,this.runEvents,this.changeSets,this.testResults,this.evidence,this.outcomes,this.claims,this.repositories,this.operationalCommands,this.documentation,this.works,this.activity,this.drafts] as Array<Collection<{id:string;projectId:string}>>;
        for(const collection of collections)for(const record of await collection.find({projectId})){await collection.delete(record.id);deleted++;}
        await this.projects.delete(projectId);deleted++;
        const residue=(await Promise.all(collections.map(collection=>collection.find({projectId})))).reduce((count,records)=>count+records.length,0)+(await this.conversations.find({projectId})).length+(await this.terminals.find({projectId})).length;
        if(residue)throw new Error(`Project removal left ${residue} orphaned records`);
        return {deleted};
    }
    async completeTask(taskId:string,mode:"manual"|"approval",note?:string):Promise<void>{
        const task=await this.tasks.get(taskId);if(!task)throw new Error("Task no longer exists");
        if(task.status==="in-progress")throw new Error("Stop the active Run before completing this task");
        if(task.status==="done")return;
        const now=Date.now(),summary=note?.trim()||(mode==="approval"?`Approved: ${task.title}`:`Completed by user: ${task.title}`),evidenceId=createId("evidence");
        await this.evidence.insert({id:evidenceId,projectId:task.projectId,workId:task.workId,taskId:task.id,kind:"review",summary,result:mode==="approval"?"passed":"unknown",provenance:mode==="approval"?"Control human review":"Control human completion",createdAt:now},evidenceId);
        const evidenceIds=(await this.evidence.find({workId:task.workId})).map(item=>item.id),outcomeId=createId("outcome");
        await this.outcomes.insert({id:outcomeId,projectId:task.projectId,workId:task.workId,taskId:task.id,status:mode==="approval"?"passed":"unknown",summary,evidenceIds,createdAt:now},outcomeId);
        await this.tasks.update(task.id,{status:"done",completedAt:now,updatedAt:now});
        await this.works.update(task.workId,{status:"completed",completedAt:now,updatedAt:now});
        for(const item of await this.inboxItems.find({workId:task.workId,toParticipantId:LOCAL_PARTICIPANT_ID,type:"review"}))if(item.status==="open"||item.status==="acknowledged")await this.inboxItems.update(item.id,{status:"acted",updatedAt:now,actedAt:now});
        const activityId=createId("activity");await this.activity.insert({id:activityId,projectId:task.projectId,workId:task.workId,taskId:task.id,type:mode==="approval"?"task_approved":"task_completed",actor:LOCAL_PARTICIPANT_ID,summary,createdAt:now},activityId);
    }
    async reconcileCanonicalGraph():Promise<{repairs:number;issues:number}>{
        let repairs=0,issues=0;const now=Date.now(),projects=new Set((await this.projects.all()).map(project=>project.id));
        const workStatus=(task:ControlTask):ControlWork["status"]=>task.status==="done"?"completed":task.status==="review"?"review":task.status==="awaiting-input"?"awaiting-input":task.status==="failed"?"failed":task.status==="in-progress"?"active":"captured";
        const tasks=await this.tasks.all(),taskById=new Map(tasks.map(task=>[task.id,task]));
        for(const task of tasks){
            if(!projects.has(task.projectId)){issues++;continue;}
            const priorWork=task.workId?await this.works.get(task.workId):undefined;
            if(!priorWork||priorWork.projectId!==task.projectId){const workId=priorWork?createId("work"):task.workId||createId("work");await this.works.insert({id:workId,projectId:task.projectId,title:task.title,intent:task.description,kind:"task",status:workStatus(task),createdAt:task.createdAt,updatedAt:now,completedAt:task.completedAt},workId);if(task.workId!==workId)await this.tasks.update(task.id,{workId,updatedAt:now});taskById.set(task.id,{...task,workId});repairs++;}
        }
        for(const conversation of await this.conversations.all()){
            if(!projects.has(conversation.projectId)){issues++;continue;}
            const task=conversation.taskId?taskById.get(conversation.taskId):undefined,targetWorkId=task?.workId||conversation.workId;
            if(targetWorkId&&await this.works.exists(targetWorkId)){if(conversation.workId!==targetWorkId){await this.conversations.update(conversation.id,{workId:targetWorkId,updatedAt:now});repairs++;}continue;}
            const workId=targetWorkId||createId("work");await this.works.insert({id:workId,projectId:conversation.projectId,title:conversation.title,intent:`Conversation: ${conversation.title}`,kind:"investigation",status:"active",createdAt:conversation.createdAt,updatedAt:now},workId);await this.conversations.update(conversation.id,{workId,updatedAt:now});repairs++;
        }
        for(const investigation of await this.investigations.all())if(!(await this.works.exists(investigation.workId))){if(!projects.has(investigation.projectId)){issues++;continue;}await this.works.insert({id:investigation.workId,projectId:investigation.projectId,title:investigation.question,intent:investigation.question,kind:"investigation",status:investigation.status==="concluded"?"completed":"active",createdAt:investigation.createdAt,updatedAt:now},investigation.workId);repairs++;}
        const linked=[this.runs,this.runEvents,this.changeSets,this.testResults,this.decisions,this.inboxItems,this.activity,this.evidence,this.outcomes] as Array<Collection<{id:string;taskId?:string;projectId:string;workId:string}>>;
        for(const collection of linked)for(const record of await collection.all())if(record.taskId){const task=taskById.get(record.taskId);if(!task){issues++;continue;}if(record.workId!==task.workId||record.projectId!==task.projectId){await collection.update(record.id,{workId:task.workId,projectId:task.projectId});repairs++;}}
        for(const message of await this.messages.all())if(!(await this.conversations.exists(message.conversationId)))issues++;
        for(const work of await this.works.all())if(!projects.has(work.projectId))issues++;
        return {repairs,issues};
    }
    async transitionRuntimeWork(taskId:string,transition:RuntimeWorkTransition,options?:{assignedTo?:string;updatedAt?:number}):Promise<void>{
        const task=await this.tasks.get(taskId);if(!task)throw new Error("Task no longer exists");
        const work=await this.works.get(task.workId);if(!work)throw new Error("Task Work no longer exists");
        const state=runtimeWorkTransition(transition),updatedAt=options?.updatedAt||Date.now();
        await this.tasks.update(task.id,{status:state.taskStatus,assignedTo:options?.assignedTo===undefined?task.assignedTo:options.assignedTo,completedAt:undefined,updatedAt});
        await this.works.update(work.id,{status:state.workStatus,completedAt:undefined,updatedAt});
    }
    async reopenTask(taskId:string,reason="Reopened by user"):Promise<void>{
        const task=await this.tasks.get(taskId);if(!task)throw new Error("Task no longer exists");
        if(task.status!=="done")throw new Error("Only completed tasks can be reopened");
        const now=Date.now(),summary=reason.trim()||"Reopened by user",outcomeId=createId("outcome");
        await this.tasks.update(task.id,{status:"not-started",completedAt:undefined,updatedAt:now});
        await this.works.update(task.workId,{status:"reopened",completedAt:undefined,updatedAt:now});
        await this.outcomes.insert({id:outcomeId,projectId:task.projectId,workId:task.workId,taskId:task.id,status:"reopened",summary,evidenceIds:[],createdAt:now},outcomeId);
        const activityId=createId("activity");await this.activity.insert({id:activityId,projectId:task.projectId,workId:task.workId,taskId:task.id,type:"task_reopened",actor:LOCAL_PARTICIPANT_ID,summary:`Reopened: ${task.title}`,details:summary,createdAt:now},activityId);
    }
    async archiveTask(taskId:string):Promise<void>{
        const task=await this.tasks.get(taskId);if(!task)throw new Error("Task no longer exists");
        if(task.status==="in-progress")throw new Error("Stop the active Run before archiving this task");
        if(task.status==="archived")return;
        const now=Date.now(),activityId=createId("activity");
        await this.tasks.update(task.id,{status:"archived",archivedFrom:task.status,updatedAt:now});
        await this.activity.insert({id:activityId,projectId:task.projectId,workId:task.workId,taskId:task.id,type:"task_archived",actor:LOCAL_PARTICIPANT_ID,summary:`Archived: ${task.title}`,createdAt:now},activityId);
    }
    async restoreTask(taskId:string):Promise<void>{
        const task=await this.tasks.get(taskId);if(!task)throw new Error("Task no longer exists");
        if(task.status!=="archived")throw new Error("Only archived tasks can be restored");
        const work=await this.works.get(task.workId),status=task.archivedFrom||(work?.status==="completed"?"done":"not-started"),now=Date.now(),activityId=createId("activity");
        await this.tasks.update(task.id,{status,archivedFrom:undefined,updatedAt:now});
        await this.activity.insert({id:activityId,projectId:task.projectId,workId:task.workId,taskId:task.id,type:"task_restored",actor:LOCAL_PARTICIPANT_ID,summary:`Restored: ${task.title}`,createdAt:now},activityId);
    }
}
const DEFAULT_AGENTS: Array<Omit<ControlAgent, "createdAt" | "updatedAt">> = [
    { id: "developer", name: "Developer", description: "Implements, debugs, tests, and reviews code.", instructions: "Inspect project conventions, implement the assigned task, run relevant checks, and report concrete results.", capabilities: ["implementation", "debugging", "testing"],timeoutMinutes:60, executionPolicy: { filesystem: "workspace-write", shell: true, network: false }, status: "active" },
    { id: "researcher", name: "Researcher", description: "Investigates technical and product questions.", instructions: "Research thoroughly, verify claims with primary sources, and return actionable findings.", capabilities: ["research", "analysis"],timeoutMinutes:60, executionPolicy: { filesystem: "read-only", shell: false, network: true }, status: "active" },
    { id: "tester", name: "Tester", description: "Finds regressions and verifies behavior.", instructions: "Test behavior and edge cases, reproduce failures, and report evidence with exact steps.", capabilities: ["testing", "qa", "review"],timeoutMinutes:60, executionPolicy: { filesystem: "workspace-write", shell: true, network: false }, status: "active" },
    { id: "planner", name: "Planner", description: "Triages work and resolves dependencies.", instructions: "Turn goals into ordered tasks with owners, dependencies, acceptance criteria, and risks.", capabilities: ["triage", "planning", "prioritization"],timeoutMinutes:60, executionPolicy: { filesystem: "read-only", shell: false, network: false }, status: "active" },
];
const DEFAULT_CAPABILITIES:Array<Omit<ControlCapability,"createdAt"|"updatedAt">>=[
    {id:"filesystem-read",name:"Read workspace",description:"Read files inside the selected project.",risk:"low",approval:"never",enabled:true},
    {id:"filesystem-write",name:"Change workspace",description:"Create and modify files inside the selected project.",risk:"medium",approval:"high-risk",enabled:true},
    {id:"shell",name:"Run commands",description:"Execute supervised commands in the project.",risk:"medium",approval:"high-risk",enabled:true},
    {id:"network",name:"Use network",description:"Access external network resources.",risk:"high",approval:"always",enabled:false},
];
let controlDatabase: ControlDatabase | undefined;
let controlTopology: ControlDataTopology | undefined;
export function getControlDatabase(): ControlDatabase {
    if (!controlDatabase)
        throw new Error("Control FeltDB has not been initialized");
    return controlDatabase;
}
export function getControlDataTopology(): ControlDataTopology {
    if (!controlTopology)
        throw new Error("Control data topology has not been initialized");
    return { ...controlTopology, token: undefined };
}
export async function initializeControlDatabase(): Promise<ControlDatabase> {
    if (controlDatabase)
        return controlDatabase;
    const response = await invoke<ControlDataTopology>("cmd_data_topology_get", { includeToken: true });
    if (!response.success || !response.data)
        throw new Error(response.error || "Unable to load Control data topology");
    const topology = response.data;
    if (topology.mode === "server" && (!topology.serverUrl || !topology.token))
        throw new Error("Remote FeltDB is configured but its OS credential is unavailable");
    const database = new ControlDatabase(topology);
    await database.initialize();
    controlDatabase = database;
    controlTopology = { ...topology, token: undefined };
    return database;
}
export async function migrateControlToServer(serverUrl: string, token: string): Promise<number> {
    const source = getControlDatabase(), target = new ControlDatabase({ mode: "server", serverUrl, token, hasCredential: true });
    await target.initialize();
    const result = await target.importSnapshot(await source.exportSnapshot());
    const saved = await invoke("cmd_data_topology_set", { serverUrl, token });
    if (!saved.success)
        throw new Error(saved.error || "Unable to save server topology");
    return result.applied;
}
export async function migrateControlToLocal(): Promise<number> {
    const source = getControlDatabase();
    if (source.topology.mode === "local")
        return 0;
    const target = new ControlDatabase({ mode: "local", hasCredential: false });
    await target.initialize();
    const result = await target.importSnapshot(await source.exportSnapshot());
    const saved = await invoke("cmd_data_topology_use_local");
    if (!saved.success)
        throw new Error(saved.error || "Unable to switch to local topology");
    return result.applied;
}
export function createId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}
