import { expect, it } from 'vitest';
import { taskListRows } from './task-list';

it('removes converted quote tasks while preserving open and completed work orders', () => {
  expect(taskListRows([
    { id: 'converted', status: 'offerte' },
    { id: 'open', status: 'nieuw' },
    { id: 'assigned', status: 'toegewezen' },
    { id: 'signed', status: 'afgetekend' },
  ]).map(row => row.id)).toEqual(['open', 'assigned', 'signed']);
});

it('hides quote-linked tasks until approval, even if their task status is reassigned', () => {
  expect(taskListRows([
    { id: 'pending', status: 'toegewezen', quote_pending: true },
    { id: 'approved', status: 'nieuw', quote_pending: false },
  ]).map(row => row.id)).toEqual(['approved']);
});