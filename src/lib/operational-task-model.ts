import type { TaskStatus } from '@/lib/types';

export type OperationalTaskCategory = 'operational_task' | 'decision' | 'follow_up' | 'review_needed';

export interface OperationalTaskCategoryDefinition {
  id: OperationalTaskCategory;
  label: string;
  description: string;
  defaultStatus: TaskStatus;
  allowedStatuses: TaskStatus[];
}

export const OPERATIONAL_TASK_CATEGORIES: OperationalTaskCategoryDefinition[] = [
  {
    id: 'operational_task',
    label: 'Operational task',
    description: 'A local Mission Control work item that can be triaged before any agent/runtime action.',
    defaultStatus: 'inbox',
    allowedStatuses: ['inbox', 'assigned', 'in_progress', 'review', 'verification', 'done'],
  },
  {
    id: 'decision',
    label: 'Decision',
    description: 'An item that needs M Jones to choose a direction before work continues.',
    defaultStatus: 'review',
    allowedStatuses: ['inbox', 'review', 'done'],
  },
  {
    id: 'follow_up',
    label: 'Follow-up',
    description: 'A later action or reminder captured safely in the queue.',
    defaultStatus: 'inbox',
    allowedStatuses: ['inbox', 'review', 'done'],
  },
  {
    id: 'review_needed',
    label: 'Review needed',
    description: 'A task or result that needs human review before it can advance.',
    defaultStatus: 'review',
    allowedStatuses: ['review', 'verification', 'done'],
  },
];

export const SAFE_CREATE_STATUSES: TaskStatus[] = ['planning', 'inbox', 'review'];

export const DISPATCHING_STATUSES: TaskStatus[] = [
  'pending_dispatch',
  'assigned',
  'in_progress',
  'convoy_active',
  'testing',
  'verification',
  'review_fix',
];

export function isSafeCreateStatus(status: TaskStatus): boolean {
  return SAFE_CREATE_STATUSES.includes(status);
}

export function getSafeCreateStatusError(status: TaskStatus): string | null {
  if (isSafeCreateStatus(status)) return null;

  if (DISPATCHING_STATUSES.includes(status)) {
    return `New v1 operational tasks must start in inbox, planning, or review. Creating a task directly in ${status} could imply dispatch or external runtime action.`;
  }

  if (status === 'done') {
    return 'New v1 operational tasks cannot be created directly as done.';
  }

  return `Unsupported create status: ${status}`;
}

export function isDispatchEnabled(): boolean {
  return process.env.DISPATCH_ENABLED === 'true' || process.env.EXTERNAL_ACTIONS_ENABLED === 'true';
}

export function getOperationalQueueGroup(status: TaskStatus): 'inbox' | 'ready' | 'running' | 'review' | 'done' {
  if (status === 'done') return 'done';
  if (['review', 'verification', 'review_fix', 'testing'].includes(status)) return 'review';
  if (['assigned', 'in_progress', 'convoy_active', 'pending_dispatch'].includes(status)) return 'running';
  return status === 'planning' ? 'ready' : 'inbox';
}
