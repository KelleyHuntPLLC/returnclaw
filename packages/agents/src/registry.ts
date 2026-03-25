import { AgentType, createChildLogger } from '@returnclaw/core';
import type { BaseAgent } from './base.js';
import { TriageAgent } from './triage/agent.js';
import { PolicyAgent } from './policy/agent.js';
import { ExecutionAgent } from './execution/agent.js';
import { CarrierAgent } from './carrier/agent.js';
import { ComplianceAgent } from './compliance/agent.js';
import { EscalationAgent } from './escalation/agent.js';

const log = createChildLogger({ component: 'agent-registry' });

export class AgentRegistry {
  private agents: Map<AgentType, BaseAgent> = new Map();
  private static instance: AgentRegistry | null = null;

  private constructor() {}

  static create(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
      AgentRegistry.instance.registerDefaults();
    }
    return AgentRegistry.instance;
  }

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      throw new Error('AgentRegistry not initialized. Call AgentRegistry.create() first.');
    }
    return AgentRegistry.instance;
  }

  private registerDefaults(): void {
    this.register(new TriageAgent());
    this.register(new PolicyAgent());
    this.register(new ExecutionAgent());
    this.register(new CarrierAgent());
    this.register(new ComplianceAgent());
    this.register(new EscalationAgent());
    log.info({ agentCount: this.agents.size }, 'Default agents registered');
  }

  register(agent: BaseAgent): void {
    this.agents.set(agent.type, agent);
    log.info({ agentType: agent.type, description: agent.description }, 'Agent registered');
  }

  get(agentType: AgentType): BaseAgent {
    const agent = this.agents.get(agentType);
    if (!agent) {
      throw new Error(`Agent not found: ${agentType}`);
    }
    return agent;
  }

  has(agentType: AgentType): boolean {
    return this.agents.has(agentType);
  }

  list(): Array<{ type: AgentType; description: string }> {
    return Array.from(this.agents.values()).map((agent) => ({
      type: agent.type,
      description: agent.description,
    }));
  }
}
