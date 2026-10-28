import { expect, it } from 'vitest';
import { taskListRows, newTaskRows, plannedTaskRows } from './task-list';

it('removes converted quote tasks while preserving open and completed work orders', () => {
  expect(taskListRows([
    { id: 'converted', status: 'offerte' },
    { id: 'open', status: 'nieuw' },
    { id: 'assigned', status: 'toegewezen' },
    { id: 'signed', status: 'afgetekend' },
  ]).map(row => row.id)).toEqual(['open', 'assigned', 'signed']);
});

it('new tasks include assigned but unplanned tasks and exclude planned, completed and quote tasks', () => {
  expect(newTaskRows([
    { id: 'new', status: 'nieuw', scheduled_date: null },
    { id: 'assigned', status: 'toegewezen', scheduled_date: null },
    { id: 'planned', status: 'nieuw', scheduled_date: '2026-10-28' },
    { id: 'done', status: 'afgetekend', scheduled_date: null },
    { id: 'quote', status: 'offerte', scheduled_date: null },
    { id: 'pending', status: 'nieuw', scheduled_date: null, quote_pending: true },
  ]).map(r => r.id)).toEqual(['new', 'assigned']);
});

it('planned tasks are separate and do not include completed work orders or pending quotes', () => {
  expect(plannedTaskRows([
    { id: 'planned', status: 'toegewezen', scheduled_date: '2026-10-28' },
    { id: 'unplanned', status: 'toegewezen', scheduled_date: null },
    { id: 'done', status: 'afgetekend', scheduled_date: '2026-10-28' },
    { id: 'pending', status: 'nieuw', scheduled_date: '2026-10-28', quote_pending: true },
  ]).map(r => r.id)).toEqual(['planned']);
});

it('hides quote-linked tasks until approval, even if their task status is reassigned', () => {
  expect(taskListRows([
    { id: 'pending', status: 'toegewezen', quote_pending: true },
    { id: 'approved', status: 'nieuw', quote_pending: false },
  ]).map(row => row.id)).toEqual(['approved']);
});