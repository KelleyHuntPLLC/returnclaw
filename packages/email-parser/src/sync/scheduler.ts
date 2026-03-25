import cron from 'node-cron';
import pino from 'pino';
import { EventEmitter } from 'events';
import { SyncWorker, SyncResult } from './worker';
import { EmailConnection } from '../providers/base';

const logger = pino({ name: 'email-parser:scheduler' });

export interface SyncConfig {
  /** Cron expression for sync frequency. Default: every 30 minutes */
  cronExpression: string;
  /** Maximum number of concurrent sync operations */
  maxConcurrent: number;
  /** Maximum number of emails to process per sync */
  batchSize: number;
}

interface UserSyncState {
  userId: string;
  connection: EmailConnection;
  config: SyncConfig;
  lastSyncAt?: Date;
  isActive: boolean;
  cronTask?: cron.ScheduledTask;
}

const DEFAULT_SYNC_CONFIG: SyncConfig = {
  cronExpression: '*/30 * * * *',
  maxConcurrent: 5,
  batchSize: 50,
};

export class EmailSyncScheduler extends EventEmitter {
  private readonly userStates: Map<string, UserSyncState> = new Map();
  private activeSyncs: number = 0;
  private readonly syncQueue: string[] = [];
  private readonly worker: SyncWorker;
  private globalTask?: cron.ScheduledTask;
  private isRunning: boolean = false;

  constructor(worker: SyncWorker) {
    super();
    this.worker = worker;
  }

  /**
   * Registers a user for periodic email sync.
   */
  registerUser(
    userId: string,
    connection: EmailConnection,
    config?: Partial<SyncConfig>,
  ): void {
    const existing = this.userStates.get(userId);
    if (existing?.cronTask) {
      existing.cronTask.stop();
    }

    const mergedConfig: SyncConfig = { ...DEFAULT_SYNC_CONFIG, ...config };

    const state: UserSyncState = {
      userId,
      connection,
      config: mergedConfig,
      isActive: true,
    };

    // If user has a custom cron schedule, create an individual task
    if (config?.cronExpression && config.cronExpression !== DEFAULT_SYNC_CONFIG.cronExpression) {
      state.cronTask = cron.schedule(mergedConfig.cronExpression, () => {
        this.enqueueSyncForUser(userId);
      });
      logger.info({ userId, cron: mergedConfig.cronExpression }, 'Registered user with custom sync schedule');
    }

    this.userStates.set(userId, state);
    logger.info({ userId }, 'User registered for email sync');
  }

  /**
   * Unregisters a user from email sync.
   */
  unregisterUser(userId: string): void {
    const state = this.userStates.get(userId);
    if (state) {
      state.isActive = false;
      if (state.cronTask) {
        state.cronTask.stop();
      }
      this.userStates.delete(userId);
      logger.info({ userId }, 'User unregistered from email sync');
    }
  }

  /**
   * Starts the global sync scheduler.
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;

    // Global task: sync all users on the default schedule
    this.globalTask = cron.schedule(DEFAULT_SYNC_CONFIG.cronExpression, () => {
      this.runGlobalSync();
    });

    logger.info(
      { cron: DEFAULT_SYNC_CONFIG.cronExpression, registeredUsers: this.userStates.size },
      'Email sync scheduler started',
    );
  }

  /**
   * Stops the global sync scheduler and all user tasks.
   */
  stop(): void {
    this.isRunning = false;

    if (this.globalTask) {
      this.globalTask.stop();
      this.globalTask = undefined;
    }

    for (const [_userId, state] of this.userStates) {
      if (state.cronTask) {
        state.cronTask.stop();
      }
    }

    logger.info('Email sync scheduler stopped');
  }

  /**
   * Triggers an immediate sync for a specific user.
   */
  async syncNow(userId: string): Promise<SyncResult> {
    const state = this.userStates.get(userId);
    if (!state) {
      throw new Error(`User ${userId} is not registered for sync`);
    }

    return this.executeSyncForUser(state);
  }

  /**
   * Runs the global sync for all users without a custom schedule.
   */
  private runGlobalSync(): void {
    for (const [userId, state] of this.userStates) {
      // Skip users with their own cron schedule
      if (state.cronTask) continue;
      if (!state.isActive) continue;

      this.enqueueSyncForUser(userId);
    }
  }

  /**
   * Enqueues a user for sync, respecting concurrency limits.
   */
  private enqueueSyncForUser(userId: string): void {
    const state = this.userStates.get(userId);
    if (!state || !state.isActive) return;

    // Don't queue duplicates
    if (this.syncQueue.includes(userId)) {
      logger.debug({ userId }, 'User already in sync queue, skipping');
      return;
    }

    if (this.activeSyncs < state.config.maxConcurrent) {
      this.executeSync(userId);
    } else {
      this.syncQueue.push(userId);
      logger.debug({ userId, queueLength: this.syncQueue.length }, 'User queued for sync');
    }
  }

  /**
   * Executes a sync for a user and processes the queue afterward.
   */
  private async executeSync(userId: string): Promise<void> {
    const state = this.userStates.get(userId);
    if (!state) return;

    this.activeSyncs++;
    logger.info({ userId, activeSyncs: this.activeSyncs }, 'Starting sync for user');

    try {
      const result = await this.executeSyncForUser(state);
      this.emit('sync:complete', { userId, result });
    } catch (error) {
      logger.error({ userId, error }, 'Sync failed for user');
      this.emit('sync:error', { userId, error });
    } finally {
      this.activeSyncs--;
      this.processQueue();
    }
  }

  /**
   * Executes the actual sync for a user.
   */
  private async executeSyncForUser(state: UserSyncState): Promise<SyncResult> {
    const result = await this.worker.processUserSync(
      state.userId,
      state.connection,
      {
        batchSize: state.config.batchSize,
        since: state.lastSyncAt,
      },
    );

    state.lastSyncAt = new Date();

    if (result.ordersFound > 0) {
      this.emit('orders:detected', {
        userId: state.userId,
        count: result.ordersFound,
        orders: result.orders,
      });
    }

    return result;
  }

  /**
   * Processes the next user in the sync queue.
   */
  private processQueue(): void {
    if (this.syncQueue.length === 0) return;

    const nextUserId = this.syncQueue.shift();
    if (nextUserId) {
      this.executeSync(nextUserId);
    }
  }

  /**
   * Returns stats about the scheduler.
   */
  getStats(): {
    registeredUsers: number;
    activeSyncs: number;
    queueLength: number;
    isRunning: boolean;
  } {
    return {
      registeredUsers: this.userStates.size,
      activeSyncs: this.activeSyncs,
      queueLength: this.syncQueue.length,
      isRunning: this.isRunning,
    };
  }

  /**
   * Updates sync configuration for a user.
   */
  updateUserConfig(userId: string, config: Partial<SyncConfig>): void {
    const state = this.userStates.get(userId);
    if (!state) {
      throw new Error(`User ${userId} is not registered for sync`);
    }

    Object.assign(state.config, config);

    // If cron expression changed, recreate the task
    if (config.cronExpression) {
      if (state.cronTask) {
        state.cronTask.stop();
      }
      state.cronTask = cron.schedule(config.cronExpression, () => {
        this.enqueueSyncForUser(userId);
      });
      logger.info({ userId, cron: config.cronExpression }, 'Updated user sync schedule');
    }
  }
}
